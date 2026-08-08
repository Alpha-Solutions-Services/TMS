import { NextRequest, NextResponse } from "next/server";
import {
  CARRIER_DOCUMENT_LABELS,
  fetchCarrierDocuments,
  getCarrierDocumentSignedUrl,
  maybeDemoteVerifiedCarrierIfDocsIncomplete,
  requiredCarrierDocumentTypes,
  resolveCarrierDocMime,
  uploadCarrierDocument,
  type CarrierDocumentType,
  type CarrierPaymentPreference,
} from "@/lib/freight/carrier-documents";
import { isCarrierIdentity } from "@/lib/freight/carrier-identity";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const TYPES = new Set<CarrierDocumentType>([
  "mc_authority",
  "w9",
  "coi",
  "factoring_noa",
  "voided_check",
]);

export async function GET() {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, carrier_status, carrier_payment_preference")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isCarrierIdentity(profile)) {
    return NextResponse.json({ error: "Carrier only" }, { status: 403 });
  }

  const preference = profile.carrier_payment_preference as
    | CarrierPaymentPreference
    | null;
  const rows = (await fetchCarrierDocuments(user.id)) ?? [];
  const required = requiredCarrierDocumentTypes(preference);

  const documents = await Promise.all(
    required.map(async (type) => {
      const row = rows.find((r) => r.document_type === type) ?? null;
      const viewUrl = row?.file_path
        ? await getCarrierDocumentSignedUrl(row.file_path)
        : null;
      return {
        type,
        label: CARRIER_DOCUMENT_LABELS[type],
        status: row?.status ?? "missing",
        rejection_reason: row?.rejection_reason ?? null,
        uploaded_at: row?.uploaded_at ?? null,
        file_purged_at: row?.file_purged_at ?? null,
        viewUrl,
      };
    }),
  );

  return NextResponse.json({ preference, documents });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role, carrier_status, carrier_payment_preference")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isCarrierIdentity(profile)) {
    return NextResponse.json({ error: "Carrier only" }, { status: 403 });
  }

  const form = await req.formData();
  const typeRaw = String(form.get("documentType") ?? "");
  if (!TYPES.has(typeRaw as CarrierDocumentType)) {
    return NextResponse.json({ error: "Invalid document type" }, { status: 400 });
  }
  const type = typeRaw as CarrierDocumentType;
  const preference = profile.carrier_payment_preference as
    | CarrierPaymentPreference
    | null;
  const required = requiredCarrierDocumentTypes(preference);
  if (!required.includes(type)) {
    return NextResponse.json(
      {
        error:
          "Document type not required for your payment preference",
      },
      { status: 400 },
    );
  }

  // Enforce server-side (UI already hides this): a carrier cannot silently
  // replace an already-approved document. Dispatch must revert it first.
  const { data: existingDoc } = await admin
    .from("tms_carrier_documents")
    .select("status")
    .eq("carrier_profile_id", user.id)
    .eq("document_type", type)
    .maybeSingle();
  if (existingDoc?.status === "approved") {
    return NextResponse.json(
      {
        error:
          "This document is already approved and can't be replaced. Contact dispatch if it needs to change.",
      },
      { status: 400 },
    );
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be 10MB or less" },
      { status: 400 },
    );
  }
  const mime = resolveCarrierDocMime(file);
  if (!mime) {
    return NextResponse.json({ error: "PDF or image only" }, { status: 400 });
  }

  const result = await uploadCarrierDocument({
    carrierProfileId: user.id,
    type,
    file: Buffer.from(await file.arrayBuffer()),
    filename: file.name || `${type}.pdf`,
    contentType: mime,
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Rejected carriers who re-upload should return to the approval queue.
  if (profile.carrier_status === "rejected") {
    await admin
      .from("profiles")
      .update({
        carrier_status: "pending",
        carrier_review_note: null,
      })
      .eq("id", user.id)
      .eq("carrier_status", "rejected");
  }

  // If this carrier was verified, a re-uploaded doc reset to pending can break
  // full approval → demote verified → pending (C1 parity for uploads).
  await maybeDemoteVerifiedCarrierIfDocsIncomplete(user.id);

  return NextResponse.json({ ok: true, row: result.row });
}
