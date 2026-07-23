import {
  brandedEmailWrap,
  createConfiguredTransporter,
  resolveSmtpFromAddress,
} from "@/lib/freight/email-transport";
import { FREIGHT_SUPPORT_EMAIL } from "@/lib/freight/constants";
import { getOpsNotifyEmails } from "@/lib/email/transport";

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
  return [...set].filter((e) => e.includes("@"));
}

async function sendOne(opts: {
  to: string | string[];
  subject: string;
  title: string;
  html: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  const transporter = createConfiguredTransporter();
  const smtpUser = process.env.SMTP_USER?.trim();
  if (!transporter || !smtpUser) {
    console.warn("[auth-notify] SMTP missing — skipped:", opts.subject);
    return { ok: false, error: "SMTP not configured" };
  }
  try {
    await transporter.sendMail({
      from: resolveSmtpFromAddress(`Alpha Solutions <${smtpUser}>`),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: brandedEmailWrap(opts.title, opts.html),
    });
    return { ok: true };
  } catch (e) {
    console.error("[auth-notify] send failed", opts.subject, e);
    return {
      ok: false,
      error: e instanceof Error ? e.message : "send failed",
    };
  }
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
 * Email support/ops + the user whenever someone logs in or signs up on TMS.
 * Must be awaited on Vercel so the function does not freeze before SMTP finishes.
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
}): Promise<{ ok: boolean; error?: string }> {
  const kind = String(opts.kind || opts.event || "activity").toLowerCase();
  const email = String(opts.email || "unknown").trim().toLowerCase() || "unknown";
  const role = String(opts.profileRole || opts.role || "unknown");
  const name = opts.displayName ? String(opts.displayName) : "";
  const detail = opts.detail ? String(opts.detail) : "";
  const isSignup = kind.includes("signup") || kind === "register";
  const label = isSignup ? "Signup" : kind.includes("login") ? "Login" : "Auth activity";

  const when = new Date().toLocaleString("en-US", {
    timeZone: "America/Los_Angeles",
    dateStyle: "medium",
    timeStyle: "short",
  });

  const supportTo = authNotifyRecipients();
  const supportHtml = `
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
  `;
  const supportText = `TMS ${label}: ${email} (${role}) at ${when} PT. ${detail}`;

  const results: { ok: boolean; error?: string }[] = [];

  if (supportTo.length > 0) {
    results.push(
      await sendOne({
        to: supportTo,
        subject: `TMS ${label}: ${email}`,
        title: `TMS ${label}`,
        html: supportHtml,
        text: supportText,
      }),
    );
  } else {
    console.warn("[auth-notify] no support recipients");
  }

  // Also notify the person who signed in / signed up
  if (email.includes("@") && email !== "unknown") {
    const userTitle = isSignup ? "Welcome to Alpha Freight TMS" : "Sign-in confirmation";
    const userHtml = isSignup
      ? `<p>Hi${name ? ` ${escapeHtml(name)}` : ""},</p>
         <p>Your Alpha Freight TMS account was created successfully.</p>
         <p><strong>Email:</strong> ${escapeHtml(email)}<br/>
         <strong>Role:</strong> ${escapeHtml(role)}<br/>
         <strong>When:</strong> ${escapeHtml(when)} PT</p>
         <p><a href="https://tms.alphasolutions.software/login" style="color:#38a3ff;">Open TMS</a></p>`
      : `<p>Hi${name ? ` ${escapeHtml(name)}` : ""},</p>
         <p>You signed in to Alpha Freight TMS.</p>
         <p><strong>Email:</strong> ${escapeHtml(email)}<br/>
         <strong>Role:</strong> ${escapeHtml(role)}<br/>
         <strong>When:</strong> ${escapeHtml(when)} PT</p>
         <p style="font-size:13px;color:#6a8caf;">If this wasn’t you, contact ${escapeHtml(FREIGHT_SUPPORT_EMAIL)}.</p>`;

    results.push(
      await sendOne({
        to: email,
        subject: isSignup
          ? "Welcome — Alpha Freight TMS account created"
          : "You signed in to Alpha Freight TMS",
        title: userTitle,
        html: userHtml,
        text: isSignup
          ? `Your TMS account was created (${email}, ${role}) at ${when} PT.`
          : `You signed in to TMS (${email}, ${role}) at ${when} PT.`,
      }),
    );
  }

  const failed = results.find((r) => !r.ok);
  return failed ?? { ok: true };
}
