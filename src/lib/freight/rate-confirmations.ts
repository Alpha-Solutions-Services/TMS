import { randomBytes } from "crypto";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const RATE_CON_TERMS_VERSION = "rc-v1-2026-08";

export function buildRateConUrl(token: string): string {
  const base =
    process.env.NEXT_PUBLIC_TMS_URL?.replace(/\/$/, "") ||
    "https://tms.alphasolutions.software";
  return `${base}/carrier/rate-con/${encodeURIComponent(token)}`;
}

export type RateConRow = {
  id: string;
  load_id: string;
  token: string;
  status: string;
  expires_at: string;
  terms_version: string;
  rate_amount: number;
  dispatch_percent: number | null;
  load_number: string | null;
  broker: string | null;
  lane: string | null;
  company_name: string | null;
  contact_name: string | null;
  signer_email: string | null;
  signer_phone: string | null;
  accepted_at: string | null;
};

export async function createRateConfirmation(params: {
  loadId: string;
  createdBy: string;
  rateAmount: number;
  dispatchPercent?: number | null;
  loadNumber?: string;
  broker?: string;
  lane?: string;
  companyName?: string;
  carrierProfileId?: string | null;
}): Promise<{ id: string; token: string; url: string } | { error: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const token = randomBytes(24).toString("hex");
  const { data, error } = await admin
    .from("tms_rate_confirmations")
    .insert({
      load_id: params.loadId,
      created_by: params.createdBy,
      carrier_profile_id: params.carrierProfileId ?? null,
      token,
      status: "pending",
      terms_version: RATE_CON_TERMS_VERSION,
      rate_amount: params.rateAmount,
      dispatch_percent: params.dispatchPercent ?? null,
      load_number: params.loadNumber ?? null,
      broker: params.broker ?? null,
      lane: params.lane ?? null,
      company_name: params.companyName ?? null,
    })
    .select("id, token")
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return {
    id: data.id as string,
    token: data.token as string,
    url: buildRateConUrl(data.token as string),
  };
}

export async function getPendingRateConByToken(token: string) {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "server" as const };

  const { data, error } = await admin
    .from("tms_rate_confirmations")
    .select(
      "id, load_id, token, status, expires_at, terms_version, rate_amount, dispatch_percent, load_number, broker, lane, company_name, contact_name, signer_email, signer_phone, accepted_at",
    )
    .eq("token", token)
    .maybeSingle();

  if (error || !data) return { ok: false as const, reason: "not_found" as const };

  if (data.status === "accepted") {
    return { ok: false as const, reason: "accepted" as const, row: data as RateConRow };
  }
  if (data.status === "revoked") {
    return { ok: false as const, reason: "revoked" as const };
  }
  if (
    data.status !== "pending" ||
    new Date(data.expires_at as string).getTime() < Date.now()
  ) {
    if (data.status === "pending") {
      await admin
        .from("tms_rate_confirmations")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("id", data.id as string)
        .eq("status", "pending");
    }
    return { ok: false as const, reason: "expired" as const };
  }

  return {
    ok: true as const,
    row: {
      ...(data as RateConRow),
      rate_amount: Number(data.rate_amount),
      dispatch_percent:
        data.dispatch_percent == null ? null : Number(data.dispatch_percent),
    },
  };
}

export async function acceptRateConfirmation(params: {
  token: string;
  contactName: string;
  email: string;
  phone: string;
  companyName?: string;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<{ ok: true; row: RateConRow } | { error: string; status?: number }> {
  const check = await getPendingRateConByToken(params.token);
  if (!check.ok) {
    if (check.reason === "accepted") {
      return { error: "Already signed", status: 409 };
    }
    return { error: "Rate confirmation invalid or expired", status: 410 };
  }

  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable", status: 500 };

  const acceptedAt = new Date().toISOString();
  const { data, error } = await admin
    .from("tms_rate_confirmations")
    .update({
      status: "accepted",
      contact_name: params.contactName.trim(),
      signer_email: params.email.trim().toLowerCase(),
      signer_phone: params.phone.trim(),
      company_name: params.companyName?.trim() || check.row.company_name,
      accepted_at: acceptedAt,
      accepted_ip: params.ip?.slice(0, 80) || null,
      accepted_user_agent: params.userAgent?.slice(0, 400) || null,
      updated_at: acceptedAt,
    })
    .eq("token", params.token)
    .eq("status", "pending")
    .select(
      "id, load_id, token, status, expires_at, terms_version, rate_amount, dispatch_percent, load_number, broker, lane, company_name, contact_name, signer_email, signer_phone, accepted_at",
    )
    .maybeSingle();

  if (error || !data) {
    return { error: error?.message ?? "Could not accept", status: 409 };
  }

  return {
    ok: true,
    row: {
      ...(data as RateConRow),
      rate_amount: Number(data.rate_amount),
      dispatch_percent:
        data.dispatch_percent == null ? null : Number(data.dispatch_percent),
    },
  };
}

export function buildRateConSections(row: {
  company_name?: string | null;
  load_number?: string | null;
  broker?: string | null;
  lane?: string | null;
  rate_amount: number;
  dispatch_percent?: number | null;
  terms_version?: string;
}) {
  const company = row.company_name || "Carrier";
  const rate = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(row.rate_amount || 0);
  const pct =
    row.dispatch_percent != null ? `${row.dispatch_percent}%` : "as agreed";

  return [
    {
      id: "header",
      title: "Rate Confirmation",
      bodyHtml: `<p><strong>Carrier:</strong> ${escape(company)}<br/>
        Load #: ${escape(row.load_number || "—")}<br/>
        Broker: ${escape(row.broker || "—")}<br/>
        Lane: ${escape(row.lane || "—")}<br/>
        Linehaul / RC amount: <strong>${escape(rate)}</strong><br/>
        Dispatch fee: <strong>${escape(pct)}</strong><br/>
        Terms version: <code>${escape(row.terms_version || RATE_CON_TERMS_VERSION)}</code></p>`,
    },
    {
      id: "a1",
      title: "1. Acceptance",
      bodyHtml: `<p>By signing, Carrier confirms the rate and load details above and authorizes Alpha Freight Network to proceed with dispatch services for this load.</p>`,
    },
    {
      id: "a2",
      title: "2. Independent contractor",
      bodyHtml: `<p>Carrier remains responsible for FMCSA compliance, drivers, equipment, insurance, and all transportation operations.</p>`,
    },
    {
      id: "a3",
      title: "3. Fees",
      bodyHtml: `<p>The dispatch fee shown applies to this load unless otherwise agreed in writing. Fees are earned when Carrier accepts the load.</p>`,
    },
    {
      id: "a4",
      title: "4. Electronic signature",
      bodyHtml: `<p>Electronic acceptance is valid under E-SIGN / UETA. Records may include name, email, phone, IP, timestamp, and terms version.</p>`,
    },
  ];
}

function escape(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
