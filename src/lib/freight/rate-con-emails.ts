import {
  brandedEmailWrap,
  createConfiguredTransporter,
  resolveSmtpFromAddress,
} from "@/lib/freight/email-transport";

/** Lightweight transactional send (uses main SMTP). */
export async function sendTransactionalEmailSafe(params: {
  to: string;
  subject: string;
  html: string;
  text: string;
  wrapTitle?: string;
  attachments?: { filename: string; content: Buffer }[];
}) {
  const transporter = createConfiguredTransporter();
  const smtpUser = process.env.SMTP_USER?.trim();
  if (!transporter || !smtpUser) {
    console.warn("[freight-mail] SMTP missing — skipped:", params.subject);
    return { ok: false as const };
  }
  await transporter.sendMail({
    from: resolveSmtpFromAddress(`Alpha Freight Network <${smtpUser}>`),
    to: params.to,
    subject: params.subject,
    text: params.text,
    html: brandedEmailWrap(params.wrapTitle ?? "Alpha Freight", params.html),
    attachments: params.attachments,
  });
  return { ok: true as const };
}
