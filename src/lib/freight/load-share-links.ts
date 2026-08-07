import { randomBytes } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export function buildLoadTrackUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_TMS_URL?.replace(/\/$/, "") ||
    "https://tms.alphasolutions.software";
  return `${base}/track/${encodeURIComponent(token)}`;
}

export function normalizeZipLast4(zip: string): string | null {
  const digits = zip.replace(/[^0-9]/g, "");
  if (digits.length < 4) return null;
  return digits.slice(-4);
}

export async function createLoadShareLink(params: {
  loadId: string;
  zipLast4: string;
  createdBy: string;
  label?: string;
  expiresInDays?: number;
}): Promise<{ token: string; trackUrl: string; id: string } | { error: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const zip = normalizeZipLast4(params.zipLast4);
  if (!zip) return { error: "ZIP must include at least 4 digits" };

  const token = randomBytes(24).toString("hex");
  const days = params.expiresInDays ?? 14;
  const expires = new Date();
  expires.setDate(expires.getDate() + days);

  const { data, error } = await admin
    .from("tms_load_share_links")
    .insert({
      load_id: params.loadId,
      token,
      zip_last4: zip,
      label: params.label?.trim() || null,
      created_by: params.createdBy,
      expires_at: expires.toISOString(),
    })
    .select("id, token")
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return {
    id: data.id as string,
    token: data.token as string,
    trackUrl: buildLoadTrackUrl(data.token as string),
  };
}

export type PublicTrackLoad = {
  loadNumber: string;
  status: string;
  pickup: string;
  delivery: string;
  lane: string;
  equipment: string;
  carrierName: string;
};

export type PublicTrackLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

export async function publicTrackLoad(
  token: string,
  zip: string,
): Promise<
  | {
      ok: true;
      load: PublicTrackLoad;
      location: PublicTrackLocation | null;
      expiresAt: string;
    }
  | { ok: false; error: string }
> {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false, error: "server" };

  const { data, error } = await admin.rpc("tms_public_load_track", {
    p_token: token.trim(),
    p_zip: zip,
  });

  if (error) {
    console.error("[tms_public_load_track]", error);
    return { ok: false, error: "lookup_failed" };
  }

  const row = data as {
    ok?: boolean;
    error?: string;
    load?: PublicTrackLoad;
    location?: PublicTrackLocation | null;
    expiresAt?: string;
  } | null;

  if (!row?.ok || !row.load) {
    return { ok: false, error: row?.error ?? "not_found" };
  }

  return {
    ok: true,
    load: row.load,
    location: row.location ?? null,
    expiresAt: row.expiresAt ?? "",
  };
}
