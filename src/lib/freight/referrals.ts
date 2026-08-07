import { randomBytes } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type ReferralRow = {
  id: string;
  code: string;
  invitee_email: string | null;
  status: string;
  reward_note: string | null;
  created_at: string;
};

function makeCode() {
  return `AFN-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export async function listReferralsForCarrier(carrierProfileId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("tms_referrals")
    .select("id, code, invitee_email, status, reward_note, created_at")
    .eq("referrer_profile_id", carrierProfileId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as ReferralRow[];
}

export async function createReferral(params: {
  referrerProfileId: string;
  inviteeEmail?: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };

  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    const { data, error } = await admin
      .from("tms_referrals")
      .insert({
        referrer_profile_id: params.referrerProfileId,
        code,
        invitee_email: params.inviteeEmail?.trim().toLowerCase() || null,
        status: "pending",
      })
      .select("id, code, invitee_email, status, reward_note, created_at")
      .single();
    if (!error && data) return { row: data as ReferralRow };
    if (error && !error.message.toLowerCase().includes("unique")) {
      return { error: error.message };
    }
  }
  return { error: "Could not allocate code" as const };
}

export async function listAllReferrals(limit = 80) {
  const admin = getServiceRoleClient();
  if (!admin) return [];
  const { data } = await admin
    .from("tms_referrals")
    .select(
      "id, code, invitee_email, status, reward_note, created_at, referrer_profile_id",
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  return data ?? [];
}

export async function updateReferralStatus(params: {
  id: string;
  status: "pending" | "registered" | "rewarded" | "cancelled";
  rewardNote?: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };
  const { error } = await admin
    .from("tms_referrals")
    .update({
      status: params.status,
      reward_note: params.rewardNote?.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);
  if (error) return { error: error.message };
  return { ok: true as const };
}
