import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { ensureStorageBucket } from "./ensure-storage-bucket";

export const CARRIER_DOCUMENTS_BUCKET = "carrier-documents";

export type CarrierDocumentType =
  | "mc_authority"
  | "w9"
  | "coi"
  | "factoring_noa"
  | "voided_check";

export type CarrierPaymentPreference = "factoring" | "quick_pay";

export type CarrierDocumentStatus = "pending" | "approved" | "rejected";

export type CarrierDocumentRow = {
  id: string;
  carrier_profile_id: string;
  document_type: CarrierDocumentType;
  file_path: string | null;
  status: CarrierDocumentStatus;
  uploaded_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  rejection_reason: string | null;
  file_purged_at: string | null;
};

const REJECTED_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

export const CARRIER_DOCUMENT_LABELS: Record<CarrierDocumentType, string> = {
  mc_authority: "MC Authority Letter",
  w9: "W-9 Form",
  coi: "Certificate of Insurance",
  factoring_noa: "Notice of Assignment (factoring)",
  voided_check: "Voided Check (quick pay)",
};

/** Required types for a preference: always MC + W-9 + COI, plus one pay doc. */
export function requiredCarrierDocumentTypes(
  preference: CarrierPaymentPreference | null | undefined,
): CarrierDocumentType[] {
  const base: CarrierDocumentType[] = ["mc_authority", "w9", "coi"];
  if (preference === "factoring") return [...base, "factoring_noa"];
  if (preference === "quick_pay") return [...base, "voided_check"];
  return base;
}

export function buildCarrierDocumentStoragePath(
  carrierProfileId: string,
  type: CarrierDocumentType,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${carrierProfileId}/${type}/${Date.now()}-${safe}`;
}

/**
 * Upload to private carrier-documents bucket and upsert tms_carrier_documents
 * (latest-wins UNIQUE on carrier_profile_id + document_type). Re-upload resets
 * status to pending and clears review fields. Service role only.
 */
export async function uploadCarrierDocument(params: {
  carrierProfileId: string;
  type: CarrierDocumentType;
  file: Buffer;
  filename: string;
  contentType: string;
}): Promise<{ path: string; row: CarrierDocumentRow } | { error: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "Storage not configured" };

  await ensureStorageBucket(CARRIER_DOCUMENTS_BUCKET);

  const path = buildCarrierDocumentStoragePath(
    params.carrierProfileId,
    params.type,
    params.filename,
  );

  let { error: uploadError } = await admin.storage
    .from(CARRIER_DOCUMENTS_BUCKET)
    .upload(path, params.file, {
      contentType: params.contentType,
      upsert: true,
    });

  if (uploadError && /bucket not found/i.test(uploadError.message)) {
    await ensureStorageBucket(CARRIER_DOCUMENTS_BUCKET);
    ({ error: uploadError } = await admin.storage
      .from(CARRIER_DOCUMENTS_BUCKET)
      .upload(path, params.file, {
        contentType: params.contentType,
        upsert: true,
      }));
  }

  if (uploadError) {
    console.error("[carrier-documents] upload failed:", uploadError);
    return { error: uploadError.message || "Storage upload failed" };
  }

  const { data: row, error: upsertError } = await admin
    .from("tms_carrier_documents")
    .upsert(
      {
        carrier_profile_id: params.carrierProfileId,
        document_type: params.type,
        file_path: path,
        status: "pending",
        uploaded_at: new Date().toISOString(),
        reviewed_by: null,
        reviewed_at: null,
        rejection_reason: null,
        file_purged_at: null,
      },
      { onConflict: "carrier_profile_id,document_type" },
    )
    .select(
      "id, carrier_profile_id, document_type, file_path, status, uploaded_at, reviewed_by, reviewed_at, rejection_reason, file_purged_at",
    )
    .maybeSingle();

  if (upsertError || !row) {
    console.error("[carrier-documents] upsert failed:", upsertError);
    return {
      error: upsertError?.message || "Could not save document metadata",
    };
  }

  return { path, row: row as CarrierDocumentRow };
}

export async function getCarrierDocumentSignedUrl(
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin.storage
    .from(CARRIER_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function fetchCarrierDocuments(
  carrierProfileId: string,
): Promise<CarrierDocumentRow[] | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("tms_carrier_documents")
    .select(
      "id, carrier_profile_id, document_type, file_path, status, uploaded_at, reviewed_by, reviewed_at, rejection_reason, file_purged_at",
    )
    .eq("carrier_profile_id", carrierProfileId)
    .order("document_type");

  if (error) {
    console.error("[carrier-documents] list failed:", error);
    return null;
  }
  return (data ?? []) as CarrierDocumentRow[];
}

/** Soft-purge storage for rejected docs older than 7 days. Keeps row + reason. */
export async function purgeExpiredRejectedCarrierDocuments(limit = 50): Promise<{
  scanned: number;
  purged: number;
  errors: string[];
}> {
  const admin = getServiceRoleClient();
  if (!admin) return { scanned: 0, purged: 0, errors: ["DB unavailable"] };

  const cutoff = new Date(Date.now() - REJECTED_RETENTION_MS).toISOString();
  const { data: rows, error } = await admin
    .from("tms_carrier_documents")
    .select("id, file_path")
    .eq("status", "rejected")
    .is("file_purged_at", null)
    .not("file_path", "is", null)
    .lt("reviewed_at", cutoff)
    .order("reviewed_at", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[carrier-documents] purge list failed:", error);
    return { scanned: 0, purged: 0, errors: [error.message] };
  }

  const list = rows ?? [];
  const errors: string[] = [];
  let purged = 0;

  for (const row of list) {
    const path = row.file_path as string | null;
    if (!path) continue;

    const { error: delErr } = await admin.storage
      .from(CARRIER_DOCUMENTS_BUCKET)
      .remove([path]);

    if (delErr && !/not found|does not exist/i.test(delErr.message)) {
      errors.push(`${row.id}: ${delErr.message}`);
      continue;
    }

    const { error: upErr } = await admin
      .from("tms_carrier_documents")
      .update({
        file_path: null,
        file_purged_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .eq("status", "rejected")
      .is("file_purged_at", null);

    if (upErr) {
      errors.push(`${row.id}: ${upErr.message}`);
      continue;
    }
    purged += 1;
  }

  return { scanned: list.length, purged, errors };
}

const CARRIER_DOC_MAX_BYTES = 10 * 1024 * 1024;

const ALLOWED_DOC_MIMES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
]);

export function resolveCarrierDocMime(file: File): string | null {
  const type = file.type?.trim().toLowerCase();
  if (type && type !== "application/octet-stream" && ALLOWED_DOC_MIMES.has(type)) {
    return type;
  }
  const name = file.name.toLowerCase();
  if (name.endsWith(".pdf")) return "application/pdf";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "image/jpeg";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".heic")) return "image/heic";
  return null;
}

/** True when every required type for preference exists and is approved. */
export async function carrierRequiredDocumentsApproved(
  carrierProfileId: string,
  preference: CarrierPaymentPreference | null | undefined,
): Promise<boolean> {
  const required = requiredCarrierDocumentTypes(preference);
  if (required.length < 4) return false;
  const rows = await fetchCarrierDocuments(carrierProfileId);
  if (!rows) return false;
  const byType = new Map(rows.map((r) => [r.document_type, r]));
  return required.every((t) => byType.get(t)?.status === "approved");
}

/**
 * C1: if carrier is verified but required docs are no longer all approved,
 * demote carrier_status → pending (service role).
 */
export async function maybeDemoteVerifiedCarrierIfDocsIncomplete(
  carrierProfileId: string,
): Promise<{ demoted: boolean }> {
  const admin = getServiceRoleClient();
  if (!admin) return { demoted: false };

  const { data: profile } = await admin
    .from("profiles")
    .select("carrier_status, carrier_payment_preference")
    .eq("id", carrierProfileId)
    .maybeSingle();

  if (profile?.carrier_status !== "verified") return { demoted: false };

  const ready = await carrierRequiredDocumentsApproved(
    carrierProfileId,
    profile.carrier_payment_preference as CarrierPaymentPreference | null,
  );
  if (ready) return { demoted: false };

  const { error } = await admin
    .from("profiles")
    .update({ carrier_status: "pending" })
    .eq("id", carrierProfileId)
    .eq("carrier_status", "verified");

  if (error) {
    console.error("[carrier-documents] demote verified carrier", error);
    return { demoted: false };
  }
  return { demoted: true };
}

/**
 * Upload the four required register docs from multipart FormData (service role).
 * Field names: mc_authority, w9, coi, factoring_noa | voided_check
 */
export async function uploadRequiredCarrierDocumentsFromFormData(params: {
  carrierProfileId: string;
  preference: CarrierPaymentPreference;
  form: FormData;
}): Promise<{ ok: true } | { error: string }> {
  const types = requiredCarrierDocumentTypes(params.preference);
  for (const type of types) {
    const entry = params.form.get(type);
    if (!(entry instanceof File) || entry.size <= 0) {
      return {
        error: `Missing required document: ${CARRIER_DOCUMENT_LABELS[type]}`,
      };
    }
    if (entry.size > CARRIER_DOC_MAX_BYTES) {
      return {
        error: `${CARRIER_DOCUMENT_LABELS[type]} must be 10MB or less`,
      };
    }
    const mime = resolveCarrierDocMime(entry);
    if (!mime) {
      return {
        error: `${CARRIER_DOCUMENT_LABELS[type]} must be PDF or image`,
      };
    }
    const buf = Buffer.from(await entry.arrayBuffer());
    const result = await uploadCarrierDocument({
      carrierProfileId: params.carrierProfileId,
      type,
      file: buf,
      filename: entry.name || `${type}.pdf`,
      contentType: mime,
    });
    if ("error" in result) return { error: result.error };
  }
  return { ok: true };
}
