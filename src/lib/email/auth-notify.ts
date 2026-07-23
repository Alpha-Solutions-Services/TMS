import type { Transporter } from "nodemailer";
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

/** Inboxes that must get login/signup alerts. Sent one-at-a-time so one bad MX cannot block others. */
export function authNotifyRecipients(): string[] {
  const set = new Set<string>();
  const add = (raw?: string | null) => {
    const e = raw?.trim().toLowerCase();
    if (e && e.includes("@")) set.add(e);
  };

  add(FREIGHT_SUPPORT_EMAIL);
  add("support@freight.alphasolutions.software");
  add("alphaassistant.alpha@gmail.com");
  add(process.env.SMTP_USER);
  for (const e of getOpsNotifyEmails()) add(e);

  return Array.from(set);
}

export function smtpConfigured(): boolean {
  return Boolean(
    process.env.SMTP_HOST?.trim() &&
      process.env.SMTP_USER?.trim() &&
      process.env.SMTP_PASS?.trim(),
  );
}

async function sendOne(
  transporter: Transporter,
  opts: {
    to: string;
    subject: string;
    title: string;
    html: string;
    text: string;
  },
): Promise<{ ok: boolean; to: string; error?: string }> {
  const smtpUser = process.env.SMTP_USER?.trim();
  if (!smtpUser) {
    return { ok: false, to: opts.to, error: "SMTP_USER missing" };
  }
  try {
    const info = await transporter.sendMail({
      from: resolveSmtpFromAddress(`Alpha Freight Network <${smtpUser}>`),
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: brandedEmailWrap(opts.title, opts.html),
    });
    console.log("[auth-notify] sent", opts.to, info.messageId || "ok");
    return { ok: true, to: opts.to };
  } catch (e) {
    const error = e instanceof Error ? e.message : "send failed";
    console.error("[auth-notify] send failed", opts.to, error);
    return { ok: false, to: opts.to, error };
  }
}

export async function sendAuthNotification(
  email: string,
  type: string,
  meta?: Record<string, unknown>,
) {
  return deliverAuthNotifications({
    kind: type,
    email,
    ...meta,
  });
}

/**
 * Email support/ops + the signed-in user on login/signup.
 * Must be awaited on Vercel. Sends each recipient separately.
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
}): Promise<{ ok: boolean; error?: string; sent?: string[] }> {
  if (!smtpConfigured()) {
    console.error(
      "[auth-notify] SMTP not configured on this deployment. Set SMTP_HOST, SMTP_USER, SMTP_PASS in Vercel.",
    );
    return { ok: false, error: "SMTP not configured" };
  }

  const transporter = createConfiguredTransporter();
  if (!transporter) {
    return { ok: false, error: "SMTP transporter unavailable" };
  }

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

  const supportHtml = `
    <p>Someone <strong>${isSignup ? "signed up" : "logged in"}</strong> on Alpha Freight TMS.</p>
    <p style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">
      <strong>Email:</strong> ${escapeHtml(email)}<br/>
      <strong>Role:</strong> ${escapeHtml(role)}<br/>
      ${name ? `<strong>Name:</strong> ${escapeHtml(name)}<br/>` : ""}
      ${opts.userId ? `<strong>User ID:</strong> ${escapeHtml(String(opts.userId))}<br/>` : ""}
      <strong>When:</strong> ${escapeHtml(when)} PT<br/>
      ${detail ? `<strong>Detail:</strong> ${escapeHtml(detail)}` : ""}
    </p>
    <p style="font-size:13px;color:#6a8caf;">Site: https://tms.alphasolutions.software</p>
  `;
  const supportText = `TMS ${label}: ${email} (${role}) at ${when} PT. ${detail}`;
  const supportSubject = `TMS ${label}: ${email}`;

  const jobs: Promise<{ ok: boolean; to: string; error?: string }>[] = [];

  for (const to of authNotifyRecipients()) {
    // Don't duplicate the user mail if they are also an ops recipient — still send ops copy.
    jobs.push(
      sendOne(transporter, {
        to,
        subject: supportSubject,
        title: `TMS ${label}`,
        html: supportHtml,
        text: supportText,
      }),
    );
  }

  if (email.includes("@") && email !== "unknown") {
    const alreadyOps = authNotifyRecipients().includes(email);
    if (!alreadyOps) {
      const userTitle = isSignup
        ? "Welcome to Alpha Freight TMS"
        : "Sign-in confirmation";
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

      jobs.push(
        sendOne(transporter, {
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
  }

  const results = await Promise.all(jobs);
  const sent = results.filter((r) => r.ok).map((r) => r.to);
  const failed = results.filter((r) => !r.ok);

  if (sent.length === 0) {
    const error = failed[0]?.error || "All auth notify sends failed";
    console.error("[auth-notify] all failed", error);
    return { ok: false, error, sent };
  }

  if (failed.length) {
    console.warn(
      "[auth-notify] partial success",
      "sent=",
      sent,
      "failed=",
      failed.map((f) => `${f.to}:${f.error}`),
    );
  }

  return { ok: true, sent };
}
