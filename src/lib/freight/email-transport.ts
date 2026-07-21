import nodemailer from "nodemailer";

function stripWrappingQuotes(value: string) {
  const v = value.trim();
  if (
    (v.startsWith('"') && v.endsWith('"')) ||
    (v.startsWith("'") && v.endsWith("'"))
  ) {
    return v.slice(1, -1).trim();
  }
  return v;
}

export function resolveSmtpFromAddress(fallbackFrom: string) {
  const fromRaw = process.env.SMTP_FROM;
  const fromStripped =
    typeof fromRaw === "string"
      ? stripWrappingQuotes(fromRaw)
      : undefined;
  return (
    fromStripped ||
    fallbackFrom ||
    process.env.SMTP_USER?.trim() ||
    "no-reply@alphasolutions.software"
  );
}

function readSmtpPass(raw: string | undefined): string | undefined {
  return raw ? stripWrappingQuotes(raw).replace(/\s+/g, "") : undefined;
}

function buildTransporter(opts: {
  host?: string;
  port: number;
  secure: boolean;
  user?: string;
  pass?: string;
}): nodemailer.Transporter | null {
  const { host, port, secure, user, pass } = opts;
  if (!host || !user || !pass) return null;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/** Shared nodemailer config with `src/app/api/contact/route.ts` */
export function createConfiguredTransporter(): nodemailer.Transporter | null {
  const transporter = buildTransporter({
    host: process.env.SMTP_HOST?.trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    user: process.env.SMTP_USER?.trim(),
    pass: readSmtpPass(process.env.SMTP_PASS),
  });

  if (!transporter) {
    console.warn("[freight-mail] SMTP not configured — skipping send");
  }

  return transporter;
}

/** Invoice send — uses DISPATCH_INVOICE_SMTP_* when set, else falls back to SMTP_*. */
export function createInvoiceTransporter(): nodemailer.Transporter | null {
  const host =
    process.env.DISPATCH_INVOICE_SMTP_HOST?.trim() || process.env.SMTP_HOST?.trim();
  const port = Number(
    process.env.DISPATCH_INVOICE_SMTP_PORT?.trim() || process.env.SMTP_PORT || 587,
  );
  const secure =
    process.env.DISPATCH_INVOICE_SMTP_SECURE?.trim() !== undefined
      ? process.env.DISPATCH_INVOICE_SMTP_SECURE === "true"
      : process.env.SMTP_SECURE === "true";
  const user =
    process.env.DISPATCH_INVOICE_SMTP_USER?.trim() || process.env.SMTP_USER?.trim();
  const pass = readSmtpPass(
    process.env.DISPATCH_INVOICE_SMTP_PASS ?? process.env.SMTP_PASS,
  );

  const transporter = buildTransporter({ host, port, secure, user, pass });

  if (!transporter) {
    console.warn("[freight-mail] Invoice SMTP not configured — skipping send");
  }

  return transporter;
}

export function resolveInvoiceFromAddress(fallbackFrom: string) {
  const fromRaw = process.env.DISPATCH_INVOICE_FROM;
  const fromStripped =
    typeof fromRaw === "string" ? stripWrappingQuotes(fromRaw) : undefined;
  return (
    fromStripped ||
    fallbackFrom ||
    process.env.DISPATCH_INVOICE_SMTP_USER?.trim() ||
    "Alpha Invoice & Payment <invoice.payment.alpha@gmail.com>"
  );
}

export function brandedEmailWrap(title: string, innerHtml: string) {
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:24px;background:#05080f;font-family:'Segoe UI',system-ui,sans-serif;">
  <div style="max-width:560px;margin:0 auto;border-radius:12px;overflow:hidden;border:1px solid rgba(56,139,253,0.2);background:#0b1120;">
    <div style="background:#0a0f1e;padding:20px;text-align:center;border-bottom:1px solid rgba(56,139,253,0.15);">
      <img alt="Alpha Solutions" src="${process.env.NEXT_PUBLIC_SITE_URL ?? "https://alphasolutions.software"}/alpha-logo.png" width="52" height="52" style="border-radius:10px;display:inline-block;">
      <p style="color:#38a3ff;font-size:12px;text-transform:uppercase;letter-spacing:0.12em;margin:12px 0 0">${title}</p>
    </div>
    <div style="padding:28px;color:#edf2f8;font-size:15px;line-height:1.6;">
      ${innerHtml}
    </div>
    <div style="padding:16px;text-align:center;font-size:12px;color:#6a8caf;border-top:1px solid rgba(56,139,253,0.15);background:#081016;">
      Alpha Solutions | <a href="https://alphasolutions.software" style="color:#38a3ff;text-decoration:none">alphasolutions.software</a> | Unsubscribe
    </div>
  </div>
</body>
</html>`;
}
