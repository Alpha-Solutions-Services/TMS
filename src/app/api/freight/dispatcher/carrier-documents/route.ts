import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  CARRIER_DOCUMENT_LABELS,
  getCarrierDocumentSignedUrl,
  maybeDemoteVerifiedCarrierIfDocsIncomplete,
  requiredCarrierDocumentTypes,
  resolveCarrierDocMime,
  uploadCarrierDocument,
  type CarrierDocumentStatus,
  type CarrierDocumentType,
  type CarrierPaymentPreference,
} from "@/lib/freight/carrier-documents";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import {
  canManageCarriersRoster,
  canUploadCarrierDocumentsFor,
} from "@/lib/tms/permissions";

type DocRow = {
  id: string;
  carrier_profile_id: string;
  document_type: string;
  file_path: string | null;
  status: string;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  file_purged_at: string | null;
  uploaded_by: string | null;
};

const STATUS_FILTERS = new Set(["pending", "approved", "rejected", "all"]);

/** GET ?status=pending|approved|rejected|all — super dispatcher document queue/history */
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

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  // Staff-upload picker (Slice E): carriers this caller may upload for.
  // Super → all carriers; full dispatcher → carriers assigned to them.
  if (req.nextUrl.searchParams.get("list") === "carriers") {
    if (role !== "super_dispatcher" && role !== "dispatcher") {
      return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
    }
    let carriersQuery = admin
      .from("profiles")
      .select(
        "id, company_name, full_name, mc_number, carrier_payment_preference, carrier_status",
      )
      .eq("role", "carrier")
      .order("company_name", { ascending: true });
    if (role !== "super_dispatcher") {
      carriersQuery = carriersQuery.eq("assigned_dispatcher_id", user.id);
    }
    const { data: carriers, error: carriersError } = await carriersQuery;
    if (carriersError) {
      console.error("[dispatcher/carrier-documents] carriers list", carriersError);
      return NextResponse.json(
        { error: "Could not load carriers" },
        { status: 500 },
      );
    }
    return NextResponse.json({ carriers: carriers ?? [] });
  }

  // Document queue/history — super only.
  if (!canManageCarriersRoster(role)) {
    return NextResponse.json({ error: "Super dispatcher only" }, { status: 403 });
  }

  const statusRaw = req.nextUrl.searchParams.get("status") || "pending";
  const status = STATUS_FILTERS.has(statusRaw) ? statusRaw : "pending";

  let query = admin
    .from("tms_carrier_documents")
    .select(
      "id, carrier_profile_id, document_type, file_path, status, uploaded_at, reviewed_by, reviewed_at, rejection_reason, file_purged_at, uploaded_by",
    )
    .order("uploaded_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);

  const { data: docs, error } = await query;

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

  const reviewerIds = Array.from(
    new Set(rows.map((d) => d.reviewed_by).filter(Boolean)),
  ) as string[];
  const { data: reviewers } = reviewerIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", reviewerIds)
    : { data: [] as Record<string, unknown>[] };
  const rmap = new Map(
    (reviewers ?? []).map((r) => [r.id as string, r] as const),
  );

  const uploaderIds = Array.from(
    new Set(rows.map((d) => d.uploaded_by).filter(Boolean)),
  ) as string[];
  const { data: uploaders } = uploaderIds.length
    ? await admin
        .from("profiles")
        .select("id, full_name, email")
        .in("id", uploaderIds)
    : { data: [] as Record<string, unknown>[] };
  const umap = new Map(
    (uploaders ?? []).map((u) => [u.id as string, u] as const),
  );

  const documents = await Promise.all(
    rows.map(async (d) => ({
      id: d.id,
      carrier_profile_id: d.carrier_profile_id,
      document_type: d.document_type,
      status: d.status,
      uploaded_at: d.uploaded_at,
      rejection_reason: d.rejection_reason,
      reviewed_at: d.reviewed_at,
      file_purged_at: d.file_purged_at,
      filePurged: Boolean(d.file_purged_at) || !d.file_path,
      label:
        CARRIER_DOCUMENT_LABELS[d.document_type as CarrierDocumentType] ??
        d.document_type,
      viewUrl: d.file_path
        ? await getCarrierDocumentSignedUrl(d.file_path)
        : null,
      reviewed_by: d.reviewed_by
        ? (rmap.get(d.reviewed_by) ?? { id: d.reviewed_by })
        : null,
      uploaded_by: d.uploaded_by
        ? (umap.get(d.uploaded_by) ?? { id: d.uploaded_by })
        : null,
      uploadedByStaff: Boolean(d.uploaded_by),
      // E2 four-eyes: the uploader cannot approve/reject their own upload.
      canReview: !d.uploaded_by || d.uploaded_by !== user.id,
      carrier: pmap.get(d.carrier_profile_id) ?? null,
    })),
  );

  return NextResponse.json({ documents });
}

const patchSchema = z.object({
  documentId: z.string().uuid(),
  decision: z.enum(["approve", "reject", "revert"]),
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
  // C2: super only via canManageCarriersRoster
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

    const { data: existing } = await admin
      .from("tms_carrier_documents")
      .select("id, carrier_profile_id, status, uploaded_by")
      .eq("id", body.documentId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // E2 four-eyes: the staff member who uploaded a document cannot approve or
    // reject it. Revert stays allowed (super-only) so a stuck doc can be reset.
    if (
      (body.decision === "approve" || body.decision === "reject") &&
      existing.uploaded_by &&
      existing.uploaded_by === user.id
    ) {
      return NextResponse.json(
        {
          error:
            "Four-eyes: you uploaded this document — another reviewer must approve or reject it.",
        },
        { status: 403 },
      );
    }

    if (body.decision === "revert") {
      if (existing.status === "pending") {
        return NextResponse.json({ error: "Already pending" }, { status: 400 });
      }
      const { error } = await admin
        .from("tms_carrier_documents")
        .update({
          status: "pending",
          reviewed_by: null,
          reviewed_at: null,
          rejection_reason: null,
        })
        .eq("id", body.documentId);
      if (error) {
        console.error("[dispatcher/carrier-documents] revert", error);
        return NextResponse.json({ error: "Revert failed" }, { status: 500 });
      }
      const demote = await maybeDemoteVerifiedCarrierIfDocsIncomplete(
        existing.carrier_profile_id as string,
      );
      return NextResponse.json({ ok: true, carrierDemoted: demote.demoted });
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

    const demote = await maybeDemoteVerifiedCarrierIfDocsIncomplete(
      existing.carrier_profile_id as string,
    );
    return NextResponse.json({ ok: true, carrierDemoted: demote.demoted });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[dispatcher/carrier-documents]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const STAFF_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;

/** POST — staff upload on behalf of a carrier (E1) with four-eyes attribution (E2). */
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

  const role = await resolveTmsRole(user);
  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const form = await req.formData();
  const carrierProfileId = String(form.get("carrierProfileId") ?? "");
  const typeRaw = String(form.get("documentType") ?? "");
  if (!carrierProfileId) {
    return NextResponse.json(
      { error: "carrierProfileId required" },
      { status: 400 },
    );
  }

  const { data: carrier } = await admin
    .from("profiles")
    .select(
      "id, role, carrier_status, carrier_payment_preference, assigned_dispatcher_id",
    )
    .eq("id", carrierProfileId)
    .eq("role", "carrier")
    .maybeSingle();
  if (!carrier) {
    return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
  }

  // E1: super may upload for any carrier; full dispatcher only if assigned.
  if (
    !canUploadCarrierDocumentsFor(
      role,
      user.id,
      carrier.assigned_dispatcher_id as string | null,
    )
  ) {
    return NextResponse.json(
      { error: "You can only upload documents for carriers assigned to you." },
      { status: 403 },
    );
  }

  const preference = carrier.carrier_payment_preference as
    | CarrierPaymentPreference
    | null;
  const required = requiredCarrierDocumentTypes(preference);
  if (!required.includes(typeRaw as CarrierDocumentType)) {
    return NextResponse.json(
      { error: "Document type not required for this carrier's payment preference" },
      { status: 400 },
    );
  }
  const type = typeRaw as CarrierDocumentType;

  const file = form.get("file");
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: "File required" }, { status: 400 });
  }
  if (file.size > STAFF_UPLOAD_MAX_BYTES) {
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
    carrierProfileId,
    type,
    file: Buffer.from(await file.arrayBuffer()),
    filename: file.name || `${type}.pdf`,
    contentType: mime,
    uploadedBy: user.id, // E2: uploader cannot approve/reject this row
  });
  if ("error" in result) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  // Parity with carrier self-upload: rejected carrier goes back to the queue.
  if (carrier.carrier_status === "rejected") {
    await admin
      .from("profiles")
      .update({ carrier_status: "pending", carrier_review_note: null })
      .eq("id", carrierProfileId)
      .eq("carrier_status", "rejected");
  }

  // Upload resets the doc to pending → demote verified carrier if now incomplete.
  await maybeDemoteVerifiedCarrierIfDocsIncomplete(carrierProfileId);

  return NextResponse.json({ ok: true, row: result.row });
}
