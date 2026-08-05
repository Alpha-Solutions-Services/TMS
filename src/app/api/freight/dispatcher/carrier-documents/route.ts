import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CARRIER_DOCUMENT_LABELS,
  getCarrierDocumentSignedUrl,
  type CarrierDocumentStatus,
  type CarrierDocumentType,
} from "@/lib/freight/carrier-documents";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageCarriersRoster } from "@/lib/tms/permissions";

type DocRow = {
  id: string;
  carrier_profile_id: string;
  document_type: string;
  file_path: string;
  status: string;
  uploaded_at: string;
  rejection_reason: string | null;
};

/** GET ?status=pending — queue for super dispatcher */
export async function GET(req: NextRequest) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await resolveTmsRole(user);
  if (!canManageCarriersRoster(role)) {
    return NextResponse.json({ error: "Super dispatcher only" }, { status: 403 });
  }

  const status = req.nextUrl.searchParams.get("status") || "pending";
  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data: docs, error } = await admin
    .from("tms_carrier_documents")
    .select(
      "id, carrier_profile_id, document_type, file_path, status, uploaded_at, rejection_reason",
    )
    .eq("status", status)
    .order("uploaded_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("[dispatcher/carrier-documents] list", error);
    return NextResponse.json(
      { error: "Could not load documents" },
      { status: 500 },
    );
  }

  const rows = (docs ?? []) as DocRow[];
  const ids = Array.from(new Set(rows.map((d) => d.carrier_profile_id)));
  const { data: profiles } = ids.length
    ? await admin
        .from("profiles")
        .select(
          "id, company_name, full_name, mc_number, email, carrier_payment_preference, carrier_status",
        )
        .in("id", ids)
    : { data: [] as Record<string, unknown>[] };

  const pmap = new Map(
    (profiles ?? []).map((p) => [p.id as string, p] as const),
  );

  const documents = await Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      carrier_profile_id: d.carrier_profile_id,
      document_type: d.document_type,
      status: d.status,
      uploaded_at: d.uploaded_at,
      rejection_reason: d.rejection_reason,
      label:
        CARRIER_DOCUMENT_LABELS[d.document_type as CarrierDocumentType] ??
        d.document_type,
      viewUrl: await getCarrierDocumentSignedUrl(d.file_path),
      carrier: pmap.get(d.carrier_profile_id) ?? null,
    })),
  );

  return NextResponse.json({ documents });
}

const patchSchema = z.object({
  documentId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
});

export async function PATCH(req: NextRequest) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await resolveTmsRole(user);
  if (!canManageCarriersRoster(role)) {
    return NextResponse.json({ error: "Super dispatcher only" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    if (body.decision === "reject" && !(body.reason ?? "").trim()) {
      return NextResponse.json(
        { error: "Rejection reason required" },
        { status: 400 },
      );
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    }

    const nextStatus: CarrierDocumentStatus =
      body.decision === "approve" ? "approved" : "rejected";

    const { error } = await admin
      .from("tms_carrier_documents")
      .update({
        status: nextStatus,
        reviewed_by: user.id,
        reviewed_at: new Date().toISOString(),
        rejection_reason:
          body.decision === "reject" ? (body.reason ?? "").trim() : null,
      })
      .eq("id", body.documentId);

    if (error) {
      console.error("[dispatcher/carrier-documents] patch", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[dispatcher/carrier-documents]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
