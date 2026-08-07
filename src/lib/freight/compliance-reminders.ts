import { sendTransactionalEmailSafe } from "@/lib/freight/rate-con-emails";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { PUBLIC_SITE_URL } from "@/lib/freight/constants";

type ReminderKind = "insurance" | "ifta" | "registration";

function daysUntil(dateStr: string): number {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function labelFor(kind: ReminderKind) {
  if (kind === "insurance") return "Insurance (COI)";
  if (kind === "ifta") return "IFTA";
  return "Registration / authority";
}

/**
 * Email carriers whose profile compliance dates fall within warnDays.
 * Idempotent enough for daily cron (same day may re-send — acceptable for Phase 2).
 */
export async function runComplianceReminders(opts?: {
  warnDays?: number;
  limit?: number;
}) {
  const warnDays = opts?.warnDays ?? 30;
  const limit = opts?.limit ?? 80;
  const admin = getServiceRoleClient();
  if (!admin) {
    return { sent: 0, checked: 0, errors: ["DB unavailable"] as string[] };
  }

  const { data, error } = await admin
    .from("profiles")
    .select(
      "id, email, full_name, company_name, insurance_expires_at, ifta_due_at, registration_expires_at, role, carrier_status",
    )
    .eq("role", "carrier")
    .not("email", "is", null)
    .limit(500);

  if (error) {
    return { sent: 0, checked: 0, errors: [error.message] };
  }

  const errors: string[] = [];
  let sent = 0;
  let checked = 0;

  for (const row of data ?? []) {
    if (sent >= limit) break;
    const email = String(row.email || "").trim().toLowerCase();
    if (!email) continue;
    checked += 1;

    const items: { kind: ReminderKind; date: string; days: number }[] = [];
    const push = (kind: ReminderKind, date: string | null) => {
      if (!date) return;
      const days = daysUntil(date);
      if (days <= warnDays) items.push({ kind, date, days });
    };
    push("insurance", row.insurance_expires_at as string | null);
    push("ifta", row.ifta_due_at as string | null);
    push("registration", row.registration_expires_at as string | null);
    if (!items.length) continue;

    const name =
      (row.company_name as string) || (row.full_name as string) || "Carrier";
    const lines = items
      .map((i) => {
        const when =
          i.days < 0
            ? `EXPIRED ${Math.abs(i.days)} day(s) ago`
            : i.days === 0
              ? "due today"
              : `due in ${i.days} day(s)`;
        return `• ${labelFor(i.kind)}: ${i.date} (${when})`;
      })
      .join("<br/>");

    const textLines = items
      .map((i) => `${labelFor(i.kind)}: ${i.date}`)
      .join("\n");

    try {
      const result = await sendTransactionalEmailSafe({
        to: email,
        subject: `Compliance reminder — ${name}`,
        wrapTitle: "Compliance",
        html: `<p>Hi ${name},</p>
          <p>Please review these upcoming compliance dates:</p>
          <p>${lines}</p>
          <p><a href="${PUBLIC_SITE_URL}/carrier/compliance" style="display:inline-block;padding:12px 20px;background:#38a3ff;color:#05080f;border-radius:10px;font-weight:700;text-decoration:none">Open compliance</a></p>`,
        text: `Compliance reminder for ${name}\n${textLines}\n${PUBLIC_SITE_URL}/carrier/compliance`,
      });
      if (result.ok) sent += 1;
    } catch (e) {
      errors.push(e instanceof Error ? e.message : "send failed");
    }
  }

  return { sent, checked, errors };
}
