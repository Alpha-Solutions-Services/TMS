import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type AnnouncementRow = {
  id: string;
  title: string;
  body: string;
  audience: "carrier" | "dispatcher" | "all";
  starts_at: string;
  ends_at: string | null;
  created_at: string;
};

export async function listActiveAnnouncements(audience: "carrier" | "all" = "carrier") {
  const admin = getServiceRoleClient();
  if (!admin) return [] as AnnouncementRow[];

  const now = Date.now();
  const { data, error } = await admin
    .from("tms_announcements")
    .select("id, title, body, audience, starts_at, ends_at, created_at")
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .limit(40);

  if (error) {
    console.warn("[announcements]", error.message);
    return [];
  }

  const allowed =
    audience === "carrier"
      ? new Set(["carrier", "all"])
      : new Set(["carrier", "dispatcher", "all"]);

  return ((data ?? []) as AnnouncementRow[])
    .filter((row) => {
      if (!allowed.has(row.audience)) return false;
      const start = new Date(row.starts_at).getTime();
      if (start > now) return false;
      if (row.ends_at && new Date(row.ends_at).getTime() < now) return false;
      return true;
    })
    .slice(0, 10);
}

export async function fetchCarrierScorecard(carrierProfileId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("tms_ai_carrier_scorecard")
    .select("load_count, delivered_count, avg_dispatch_percent, carrier_name")
    .eq("carrier_profile_id", carrierProfileId)
    .maybeSingle();

  if (error) {
    console.warn("[scorecard]", error.message);
    return null;
  }
  if (!data) return null;

  return {
    load_count: Number(data.load_count) || 0,
    delivered_count: Number(data.delivered_count) || 0,
    avg_dispatch_percent:
      data.avg_dispatch_percent == null ? null : Number(data.avg_dispatch_percent),
    carrier_name: (data.carrier_name as string) || null,
  };
}

export async function createAnnouncement(params: {
  title: string;
  body: string;
  audience: "carrier" | "dispatcher" | "all";
  createdBy: string;
  endsAt?: string | null;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };

  const { data, error } = await admin
    .from("tms_announcements")
    .insert({
      title: params.title.trim(),
      body: params.body.trim(),
      audience: params.audience,
      created_by: params.createdBy,
      ends_at: params.endsAt || null,
    })
    .select("id, title, body, audience, starts_at, ends_at, created_at")
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return { row: data as AnnouncementRow };
}

export async function softDeleteAnnouncement(id: string) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };

  const { error } = await admin
    .from("tms_announcements")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  if (error) return { error: error.message };
  return { ok: true as const };
}
