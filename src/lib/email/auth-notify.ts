import { FREIGHT_SUPPORT_EMAIL } from "@/lib/freight/constants";
import { getOpsNotifyEmails, sendBrandedMail } from "@/lib/email/transport";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function authNotifyRecipients(): string[] {
  const set = new Set<string>([
    FREIGHT_SUPPORT_EMAIL,
    "support@freight.alphasolutions.software",
    ...getOpsNotifyEmails(),
  ]);
  return [...set].filter(Boolean);
}

export async function sendAuthNotification(
  email: string,
  type: string,
  meta?: Record<string, unknown>,
) {
  await deliverAuthNotifications({
    kind: type,
    email,
    ...meta,
  });
}

/**
 * Email support/ops whenever someone logs in or signs up on TMS.
 */
export async function deliverAuthNotifications(opts: {
  kind?: string;
  event?: string;
  email?: string;
  userId?: string;
  profileRole?: string;
  role?: string;
  displayName?: string;
  detail?: string;
  [key: string]: unknown;
}) {
  const kind = String(opts.kind || opts.event || "activity").toLowerCase();
  const email = String(opts.email || "unknown").trim() || "unknown";
  const role = String(opts.profileRole || opts.role || "unknown");
  const name = opts.displayName ? String(opts.displayName) : "";
  const detail = opts.detail ? String(opts.detail) : "";
  const isSignup = kind.includes("signup") || kind === "register";
  const label = isSignup ? "Signup" : kind.includes("login") ? "Login" : "Auth activity";

  const to = authNotifyRecipients();
  if (to.length === 0) {
    console.warn("[auth-notify] no recipients configured");
    return;
  }

  const when = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });

  try {
    await sendBrandedMail({
      to,
      subject: `TMS ${label}: ${email}`,
      title: `TMS ${label}`,
      html: `
        <p>Someone ${isSignup ? "signed up" : "logged in"} on Alpha Freight TMS.</p>
        <p style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">
          <strong>Email:</strong> ${escapeHtml(email)}<br/>
          <strong>Role:</strong> ${escapeHtml(role)}<br/>
          ${name ? `<strong>Name:</strong> ${escapeHtml(name)}<br/>` : ""}
          ${opts.userId ? `<strong>User ID:</strong> ${escapeHtml(String(opts.userId))}<br/>` : ""}
          <strong>When:</strong> ${escapeHtml(when)} PT<br/>
          ${detail ? `<strong>Detail:</strong> ${escapeHtml(detail)}` : ""}
        </p>
        <p style="font-size:13px;color:#6a8caf;">Site: tms.alphasolutions.software</p>
      `,
    });
  } catch (e) {
    console.error("[auth-notify] send failed", kind, email, e);
  }
}
