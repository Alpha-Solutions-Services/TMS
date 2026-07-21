import type { InvoiceIssuer } from "./dispatch-invoice";

export type InvoicePaymentMethod = "s_zelle" | "m_zelle";

export type InvoicePaymentDetails = {
  method: InvoicePaymentMethod;
  heading: string;
  lines: string[];
};

export const INVOICE_PAYMENT_OPTIONS: {
  value: InvoicePaymentMethod;
  label: string;
  shortLabel: string;
}[] = [
  { value: "s_zelle", label: "S Zelle — Suzy Agon", shortLabel: "S Zelle" },
  { value: "m_zelle", label: "M Zelle — Maliha Shahid", shortLabel: "M Zelle" },
];

export function parseInvoicePaymentMethod(value: unknown): InvoicePaymentMethod {
  if (value === "m_zelle" || value === "s_zelle") {
    return value;
  }
  return "s_zelle";
}

export function resolveInvoicePaymentDetails(
  issuer: InvoiceIssuer,
  method: InvoicePaymentMethod,
): InvoicePaymentDetails {
  if (method === "m_zelle") {
    const lines = [
      `Number : ${issuer.zelleNumber2}`,
      `Name : ${issuer.zelleName2}`,
    ];
    if (issuer.zelleEmail2) lines.push(`Email : ${issuer.zelleEmail2}`);
    return { method, heading: "Zelle", lines };
  }

  return {
    method,
    heading: "Zelle",
    lines: [`Number : ${issuer.zelleNumber}`, `Name : ${issuer.zelleName}`],
  };
}

export function paymentDetailsToEmailText(details: InvoicePaymentDetails): string {
  const prefix = "Zelle";
  const body = details.lines
    .map((line) => {
      const [key, ...rest] = line.split(" : ");
      return `${key}: ${rest.join(" : ")}`;
    })
    .join("\n");
  return `${prefix} Payment Information:\n\n${body}`;
}

export function paymentDetailsToEmailHtml(details: InvoicePaymentDetails): string {
  const rows = details.lines
    .map((line) => {
      const idx = line.indexOf(" : ");
      if (idx < 0) return `<p style="margin:0 0 6px">${escapeHtml(line)}</p>`;
      const key = line.slice(0, idx);
      const val = line.slice(idx + 3);
      return `<p style="margin:0 0 6px"><strong>${escapeHtml(key)}:</strong> ${escapeHtml(val)}</p>`;
    })
    .join("");

  return `<p style="margin-bottom:8px;"><strong>Zelle Payment Information:</strong></p>${rows}`;
}

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
