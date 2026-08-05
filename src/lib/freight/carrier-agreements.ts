import { randomBytes } from "crypto";
import {
  CARRIER_AGREEMENT_TERMS_VERSION,
  clampAgreementPercent,
} from "@/lib/freight/carrier-agreement-terms";
import { createCarrierInvitation, buildCarrierInviteUrl } from "@/lib/freight/carrier-invitations";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type CarrierAgreementRow = {
  id: string;
  created_by: string;
  assigned_dispatcher_id: string | null;
  invited_email: string | null;
  dispatch_percent: number;
  requires_documents: boolean;
  token: string;
  status: string;
  expires_at: string;
  terms_version: string;
  company_name: string | null;
  contact_name: string | null;
  carrier_email: string | null;
  carrier_phone: string | null;
  accepted_at: string | null;
  invitation_id: string | null;
  created_at: string;
};

export function buildCarrierAgreementUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_TMS_URL?.replace(/\/$/, "") ||
    "https://tms.alphasolutions.software";
  return `${base}/carrier/agreement/${encodeURIComponent(token)}`;
}

/** Permanent link to the electronically signed record (accepted agreements). */
export function buildCarrierAgreementSignedUrl(token: string): string {
  return `${buildCarrierAgreementUrl(token)}/signed`;
}

export async function createCarrierAgreement(params: {
  createdBy: string;
  dispatchPercent: number;
  invitedEmail?: string;
  requiresDocuments?: boolean;
  assignedDispatcherId?: string | null;
}): Promise<
  | { id: string; token: string; agreementUrl: string; dispatchPercent: number }
  | { error: string }
> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const percent = clampAgreementPercent(params.dispatchPercent);
  const token = randomBytes(32).toString("hex");
  const invitedEmail = params.invitedEmail?.trim().toLowerCase() || null;

  const { data, error } = await admin
    .from("tms_carrier_agreements")
    .insert({
      created_by: params.createdBy,
      assigned_dispatcher_id: params.assignedDispatcherId ?? null,
      invited_email: invitedEmail,
      dispatch_percent: percent,
      requires_documents: params.requiresDocuments !== false,
      token,
      status: "pending",
      terms_version: CARRIER_AGREEMENT_TERMS_VERSION,
    })
    .select("id, token, dispatch_percent")
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };

  return {
    id: data.id as string,
    token: data.token as string,
    agreementUrl: buildCarrierAgreementUrl(data.token as string),
    dispatchPercent: Number(data.dispatch_percent),
  };
}

export async function validateCarrierAgreementToken(token: string) {
  const admin = getServiceRoleClient();
  if (!admin) return { valid: false as const, reason: "server" as const };

  const { data: row, error } = await admin
    .from("tms_carrier_agreements")
    .select(
      "id, created_by, assigned_dispatcher_id, invited_email, dispatch_percent, requires_documents, token, status, expires_at, terms_version, company_name, contact_name, carrier_email, carrier_phone, accepted_at, invitation_id, created_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !row) {
    return { valid: false as const, reason: "not_found" as const };
  }

  if (row.status === "accepted") {
    return {
      valid: false as const,
      reason: "accepted" as const,
      agreement: row as CarrierAgreementRow,
    };
  }

  if (row.status === "revoked") {
    return { valid: false as const, reason: "revoked" as const };
  }

  const expired =
    row.status !== "pending" ||
    new Date(row.expires_at as string).getTime() < Date.now();

  if (expired) {
    if (row.status === "pending") {
      await admin
        .from("tms_carrier_agreements")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", row.id as string)
        .eq("status", "pending");
    }
    return { valid: false as const, reason: "expired" as const };
  }

  return {
    valid: true as const,
    agreement: {
      ...(row as CarrierAgreementRow),
      dispatch_percent: Number(row.dispatch_percent),
    },
  };
}

export async function revokeCarrierAgreement(params: {
  id: string;
  actorId: string;
}): Promise<{ ok: true } | { error: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const { error } = await admin
    .from("tms_carrier_agreements")
    .update({
      status: "revoked",
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id)
    .eq("status", "pending");

  if (error) return { error: error.message };
  return { ok: true };
}

export async function acceptCarrierAgreement(params: {
  token: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<
  | {
      ok: true;
      agreementId: string;
      dispatchPercent: number;
      companyName: string;
      contactName: string;
      email: string;
      phone: string;
      inviteUrl: string;
      inviteToken: string;
      createdBy: string;
      termsVersion: string;
      acceptedAt: string;
      requiresDocuments: boolean;
    }
  | { error: string; status?: number }
> {
  const check = await validateCarrierAgreementToken(params.token);
  if (!check.valid) {
    if (check.reason === "accepted") {
      return { error: "This agreement was already accepted", status: 409 };
    }
    return { error: "Agreement link is invalid or expired", status: 410 };
  }

  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable", status: 500 };

  const companyName = params.companyName.trim();
  const contactName = params.contactName.trim();
  const email = params.email.trim().toLowerCase();
  const phone = params.phone.trim();
  const percent = clampAgreementPercent(check.agreement.dispatch_percent);
  const acceptedAt = new Date().toISOString();

  const invite = await createCarrierInvitation({
    invitedBy: check.agreement.created_by,
    invitedEmail: email,
    inviteeName: contactName,
    requiresDocuments: check.agreement.requires_documents,
    assignedDispatcherId: check.agreement.assigned_dispatcher_id,
  });

  if ("error" in invite) {
    return { error: invite.error, status: 500 };
  }

  const { data: updated, error: updErr } = await admin
    .from("tms_carrier_agreements")
    .update({
      status: "accepted",
      company_name: companyName,
      contact_name: contactName,
      carrier_email: email,
      carrier_phone: phone,
      accepted_at: acceptedAt,
      accepted_ip: params.ip?.slice(0, 80) || null,
      accepted_user_agent: params.userAgent?.slice(0, 400) || null,
      invitation_id: invite.id,
      updated_at: acceptedAt,
    })
    .eq("token", params.token)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();

  if (updErr || !updated) {
    await admin
      .from("tms_carrier_invitations")
      .update({ status: "revoked" })
      .eq("id", invite.id)
      .eq("status", "pending");
    return {
      error: updErr?.message ?? "Could not accept agreement (may already be accepted)",
      status: 409,
    };
  }

  // Seed default % onto any existing carrier profile with this email
  await admin
    .from("profiles")
    .update({ default_dispatch_percent: percent })
    .eq("email", email)
    .eq("role", "carrier");

  return {
    ok: true,
    agreementId: updated.id as string,
    dispatchPercent: percent,
    companyName,
    contactName,
    email,
    phone,
    inviteUrl: invite.inviteUrl,
    inviteToken: invite.token,
    createdBy: check.agreement.created_by,
    termsVersion: check.agreement.terms_version,
    acceptedAt,
    requiresDocuments: check.agreement.requires_documents,
  };
}

/** Latest accepted agreement % for a company name (case-insensitive). */
export async function lookupDefaultDispatchPercentByCompany(
  companyName: string,
): Promise<number | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;
  const name = companyName.trim();
  if (!name) return null;

  const { data } = await admin
    .from("tms_carrier_agreements")
    .select("dispatch_percent, accepted_at")
    .eq("status", "accepted")
    .ilike("company_name", name)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (data?.dispatch_percent != null) {
    return clampAgreementPercent(Number(data.dispatch_percent));
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("default_dispatch_percent")
    .eq("role", "carrier")
    .ilike("company_name", name)
    .not("default_dispatch_percent", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (profile?.default_dispatch_percent != null) {
    return clampAgreementPercent(Number(profile.default_dispatch_percent));
  }

  return null;
}

/** Default % from an accepted agreement linked to a carrier invite. */
export async function lookupDefaultDispatchPercentByInviteToken(
  inviteToken: string,
): Promise<number | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data: invite } = await admin
    .from("tms_carrier_invitations")
    .select("id")
    .eq("token", inviteToken)
    .maybeSingle();
  if (!invite?.id) return null;

  const { data: agreement } = await admin
    .from("tms_carrier_agreements")
    .select("dispatch_percent")
    .eq("invitation_id", invite.id as string)
    .eq("status", "accepted")
    .maybeSingle();

  if (agreement?.dispatch_percent == null) return null;
  return clampAgreementPercent(Number(agreement.dispatch_percent));
}

/** Load an accepted agreement for the permanent signed record page. */
export async function getAcceptedCarrierAgreementByToken(token: string) {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "server" as const };

  const { data: row, error } = await admin
    .from("tms_carrier_agreements")
    .select(
      "id, dispatch_percent, token, status, terms_version, company_name, contact_name, carrier_email, carrier_phone, accepted_at, accepted_ip, created_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !row) return { ok: false as const, reason: "not_found" as const };
  if (row.status !== "accepted") {
    return { ok: false as const, reason: "not_accepted" as const, status: row.status as string };
  }

  return {
    ok: true as const,
    agreement: {
      id: row.id as string,
      token: row.token as string,
      dispatch_percent: Number(row.dispatch_percent),
      terms_version: row.terms_version as string,
      company_name: (row.company_name as string) || "",
      contact_name: (row.contact_name as string) || "",
      carrier_email: (row.carrier_email as string) || "",
      carrier_phone: (row.carrier_phone as string) || "",
      accepted_at: row.accepted_at as string,
      accepted_ip: (row.accepted_ip as string | null) ?? null,
      created_at: row.created_at as string,
    },
  };
}

export { buildCarrierInviteUrl };
