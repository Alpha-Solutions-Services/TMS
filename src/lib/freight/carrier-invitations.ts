import { randomBytes } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type CarrierInviteRow = {
  id: string;
  invited_email: string;
  invitee_name: string | null;
  requires_documents: boolean;
  assigned_dispatcher_id: string | null;
  token: string;
  status: string;
  expires_at: string;
};

export function buildCarrierInviteUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_TMS_URL?.replace(/\/$/, "") ||
    "https://tms.alphasolutions.software";
  return `${base}/carrier/register?invite=${encodeURIComponent(token)}`;
}

export async function validateCarrierInviteToken(token: string) {
  const admin = getServiceRoleClient();
  if (!admin) return { valid: false as const, reason: "server" as const };

  const { data: invite, error } = await admin
    .from("tms_carrier_invitations")
    .select(
      "id, invited_email, invitee_name, requires_documents, assigned_dispatcher_id, token, expires_at, status, invited_by",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) {
    return { valid: false as const, reason: "not_found" as const };
  }

  const expired =
    invite.status !== "pending" ||
    new Date(invite.expires_at as string).getTime() < Date.now();

  if (expired) {
    await admin
      .from("tms_carrier_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id as string)
      .eq("status", "pending");
    return { valid: false as const, reason: "expired" as const };
  }

  const { data: inviter } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", invite.invited_by as string)
    .maybeSingle();

  return {
    valid: true as const,
    invite: {
      id: invite.id as string,
      invited_email: invite.invited_email as string,
      invitee_name: (invite.invitee_name as string | null) ?? null,
      requires_documents: Boolean(invite.requires_documents),
      assigned_dispatcher_id: (invite.assigned_dispatcher_id as string | null) ?? null,
      token: invite.token as string,
      status: invite.status as string,
      expires_at: invite.expires_at as string,
    },
    invitedEmail: (invite.invited_email as string).trim().toLowerCase(),
    inviteeName: (invite.invitee_name as string | null) ?? "",
    requiresDocuments: Boolean(invite.requires_documents),
    assignedDispatcherId: (invite.assigned_dispatcher_id as string | null) ?? null,
    inviterName: inviter?.full_name ?? inviter?.email ?? "Alpha Freight",
    expiresAt: invite.expires_at as string,
  };
}

export async function acceptCarrierInvite(params: {
  token: string;
  profileId: string;
}): Promise<{ ok: true } | { error: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const check = await validateCarrierInviteToken(params.token);
  if (!check.valid) return { error: "Invite invalid or expired" };

  const { error: invErr } = await admin
    .from("tms_carrier_invitations")
    .update({
      status: "accepted",
      accepted_at: new Date().toISOString(),
      accepted_profile_id: params.profileId,
    })
    .eq("token", params.token)
    .eq("status", "pending");

  if (invErr) return { error: invErr.message };
  return { ok: true };
}

export async function createCarrierInvitation(params: {
  invitedBy: string;
  invitedEmail: string;
  inviteeName?: string;
  requiresDocuments: boolean;
  assignedDispatcherId?: string | null;
}): Promise<{ token: string; inviteUrl: string } | { error: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const token = randomBytes(32).toString("hex");
  const email = params.invitedEmail.trim().toLowerCase();

  const { error } = await admin.from("tms_carrier_invitations").insert({
    invited_by: params.invitedBy,
    invited_email: email,
    invitee_name: params.inviteeName?.trim() || null,
    requires_documents: params.requiresDocuments,
    assigned_dispatcher_id: params.assignedDispatcherId ?? null,
    token,
    status: "pending",
  });

  if (error) return { error: error.message };
  return { token, inviteUrl: buildCarrierInviteUrl(token) };
}
