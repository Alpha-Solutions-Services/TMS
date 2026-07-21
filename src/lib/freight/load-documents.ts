import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { ensureStorageBucket } from "./ensure-storage-bucket";

export const LOAD_DOCUMENTS_BUCKET = "freight-load-documents";

export type LoadDocumentType = "rate_con" | "bol" | "commodity" | "pod";

const COLUMN_BY_TYPE: Record<LoadDocumentType, string> = {
  rate_con: "rate_con_path",
  bol: "bol_path",
  commodity: "commodity_path",
  pod: "pod_path",
};

export function documentColumnForType(type: LoadDocumentType): string {
  return COLUMN_BY_TYPE[type];
}

export function buildDocumentStoragePath(
  loadId: string,
  type: LoadDocumentType,
  filename: string,
): string {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
  return `${loadId}/${type}/${Date.now()}-${safe}`;
}

export async function uploadLoadDocument(params: {
  loadId: string;
  type: LoadDocumentType;
  file: Buffer;
  filename: string;
  contentType: string;
}): Promise<{ path: string } | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  await ensureStorageBucket(LOAD_DOCUMENTS_BUCKET);

  const path = buildDocumentStoragePath(params.loadId, params.type, params.filename);
  let { error: uploadError } = await admin.storage
    .from(LOAD_DOCUMENTS_BUCKET)
    .upload(path, params.file, {
      contentType: params.contentType,
      upsert: true,
    });

  if (uploadError && /bucket not found/i.test(uploadError.message)) {
    await ensureStorageBucket(LOAD_DOCUMENTS_BUCKET);
    ({ error: uploadError } = await admin.storage
      .from(LOAD_DOCUMENTS_BUCKET)
      .upload(path, params.file, {
        contentType: params.contentType,
        upsert: true,
      }));
  }

  if (uploadError) {
    console.error("[load-documents] upload failed:", uploadError);
    return null;
  }

  const column = documentColumnForType(params.type);
  const { error: updateError } = await admin
    .from("dispatch_loads")
    .update({ [column]: path })
    .eq("id", params.loadId);

  if (updateError) {
    console.error("[load-documents] path update failed:", updateError);
    return null;
  }

  return { path };
}

export async function getLoadDocumentSignedUrl(
  path: string | null | undefined,
  expiresIn = 3600,
): Promise<string | null> {
  if (!path) return null;
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin.storage
    .from(LOAD_DOCUMENTS_BUCKET)
    .createSignedUrl(path, expiresIn);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

export async function fetchLoadDocumentPaths(loadId: string): Promise<{
  rate_con_path: string | null;
  bol_path: string | null;
  commodity_path: string | null;
  pod_path: string | null;
} | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("dispatch_loads")
    .select("rate_con_path, bol_path, commodity_path, pod_path")
    .eq("id", loadId)
    .maybeSingle();

  if (error || !data) return null;
  return data as {
    rate_con_path: string | null;
    bol_path: string | null;
    commodity_path: string | null;
    pod_path: string | null;
  };
}

export async function fetchLoadNotificationContext(loadId: string): Promise<{
  loadNumber: string;
  companyName: string;
  carrierProfileId: string | null;
  assignedDriverProfileId: string | null;
  email: string | null;
} | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("dispatch_loads")
    .select(
      "load_number, sr, company_name, carrier_profile_id, assigned_driver_profile_id, email",
    )
    .eq("id", loadId)
    .maybeSingle();

  if (error || !data) return null;

  return {
    loadNumber: (data.load_number as string) || `SR-${data.sr}`,
    companyName: data.company_name as string,
    carrierProfileId: data.carrier_profile_id as string | null,
    assignedDriverProfileId: data.assigned_driver_profile_id as string | null,
    email: data.email as string | null,
  };
}

export async function resolveProfileEmail(profileId: string): Promise<string | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin.from("profiles").select("email").eq("id", profileId).maybeSingle();
  return (data?.email as string) || null;
}

export async function resolveProfileName(profileId: string): Promise<string> {
  const admin = getServiceRoleClient();
  if (!admin) return "User";
  const { data } = await admin
    .from("profiles")
    .select("full_name, company_name")
    .eq("id", profileId)
    .maybeSingle();
  return (data?.full_name as string) || (data?.company_name as string) || "User";
}

export const DOCUMENT_LABELS: Record<LoadDocumentType, string> = {
  rate_con: "Rate confirmation",
  bol: "Bill of lading (BOL)",
  commodity: "Commodity photo",
  pod: "Proof of delivery (POD)",
};
