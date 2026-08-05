import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  CARRIER_AGREEMENT_TERMS_VERSION,
  buildCarrierAgreementOnlySections,
  buildCarrierTermsOfServiceSections,
  type CarrierAgreementTermsInput,
} from "@/lib/freight/carrier-agreement-terms";

const ACCENT = rgb(0.22, 0.64, 1); // #38a3ff
const INK = rgb(0.05, 0.08, 0.12);
const MUTED = rgb(0.35, 0.42, 0.5);

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function wrapLines(text: string, maxChars: number): string[] {
  const cleaned = text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
  const out: string[] = [];
  for (const raw of cleaned.split("\n")) {
    const line = raw.trimEnd();
    if (!line) {
      out.push("");
      continue;
    }
    let remaining = line;
    while (remaining.length > maxChars) {
      let breakAt = remaining.lastIndexOf(" ", maxChars);
      if (breakAt < maxChars * 0.5) breakAt = maxChars;
      out.push(remaining.slice(0, breakAt).trimEnd());
      remaining = remaining.slice(breakAt).trimStart();
    }
    if (remaining) out.push(remaining);
  }
  return out;
}

function termsOfServiceUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_TMS_URL?.replace(/\/$/, "") ||
    "https://tms.alphasolutions.software";
  return `${base}/carrier/terms`;
}

async function embedAfnLogo(doc: PDFDocument) {
  try {
    const logoPath = path.join(process.cwd(), "public", "afn-logo.png");
    const bytes = await readFile(logoPath);
    return await doc.embedPng(bytes);
  } catch (err) {
    console.warn("[carrier-agreement-pdf] AFN logo missing", err);
    return null;
  }
}

export async function buildCarrierAgreementPdf(params: {
  input: CarrierAgreementTermsInput;
  acceptedAt?: string;
  acceptedIp?: string | null;
  inviteUrl?: string;
  signedUrl?: string;
}): Promise<{ pdf: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const logo = await embedAfnLogo(doc);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 48;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 10;
  const lineHeight = 13;
  const charsPerLine = Math.floor(maxWidth / 5.15);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const ensureSpace = (needed: number) => {
    if (y < margin + needed) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
  };

  const drawLine = (
    text: string,
    opts?: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> },
  ) => {
    ensureSpace(lineHeight + 2);
    page.drawText(text, {
      x: margin,
      y,
      size: opts?.size ?? fontSize,
      font: opts?.bold ? bold : font,
      color: opts?.color ?? INK,
      maxWidth,
    });
    y -= (opts?.size ?? fontSize) + 3;
  };

  // Colored brand header bar
  page.drawRectangle({
    x: 0,
    y: pageHeight - 96,
    width: pageWidth,
    height: 96,
    color: rgb(0.02, 0.05, 0.1),
  });
  page.drawRectangle({
    x: 0,
    y: pageHeight - 100,
    width: pageWidth,
    height: 4,
    color: ACCENT,
  });

  if (logo) {
    const logoH = 64;
    const logoW = (logo.width / logo.height) * logoH;
    page.drawImage(logo, {
      x: margin,
      y: pageHeight - 88,
      width: Math.min(logoW, 72),
      height: logoH,
    });
    page.drawText("ALPHA FREIGHT NETWORK", {
      x: margin + Math.min(logoW, 72) + 14,
      y: pageHeight - 48,
      size: 14,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Electronically signed carrier agreement", {
      x: margin + Math.min(logoW, 72) + 14,
      y: pageHeight - 66,
      size: 9,
      font,
      color: ACCENT,
    });
  } else {
    page.drawText("ALPHA FREIGHT NETWORK", {
      x: margin,
      y: pageHeight - 48,
      size: 16,
      font: bold,
      color: rgb(1, 1, 1),
    });
  }

  y = pageHeight - 120;

  drawLine("Carrier Dispatch Services Agreement", {
    bold: true,
    size: 15,
    color: ACCENT,
  });
  y -= 4;

  drawLine(`Terms version: ${CARRIER_AGREEMENT_TERMS_VERSION}`, {
    bold: true,
    size: 9,
    color: MUTED,
  });
  if (params.acceptedAt) {
    drawLine(
      `Electronically accepted: ${new Date(params.acceptedAt).toLocaleString(
        "en-US",
        { dateStyle: "long", timeStyle: "short" },
      )}`,
      { size: 9 },
    );
  }
  if (params.acceptedIp) {
    drawLine(`Acceptance IP: ${params.acceptedIp}`, { size: 9, color: MUTED });
  }
  if (params.signedUrl) {
    drawLine(`Signed record: ${params.signedUrl}`, { size: 8, color: ACCENT });
  }
  if (params.inviteUrl) {
    drawLine(`TMS invite: ${params.inviteUrl}`, { size: 8, color: MUTED });
  }

  y -= 6;
  page.drawRectangle({
    x: margin,
    y: y - 2,
    width: maxWidth,
    height: 1.5,
    color: ACCENT,
  });
  y -= 14;

  const sections = buildCarrierAgreementOnlySections(params.input);
  for (const section of sections) {
    ensureSpace(40);
    drawLine(section.title, { bold: true, size: 11, color: ACCENT });
    for (const line of wrapLines(stripHtml(section.bodyHtml), charsPerLine)) {
      drawLine(line, { size: 9.5 });
    }
    y -= 6;
  }

  y -= 4;
  ensureSpace(50);
  drawLine("Terms of Service", { bold: true, size: 12, color: ACCENT });
  drawLine(
    "The following Terms of Service are incorporated into and form part of this Agreement.",
    { size: 9.5 },
  );
  drawLine(`Also published at: ${termsOfServiceUrl()}`, {
    size: 8.5,
    color: MUTED,
  });
  y -= 4;

  for (const section of buildCarrierTermsOfServiceSections()) {
    ensureSpace(36);
    drawLine(section.title, { bold: true, size: 10.5, color: ACCENT });
    for (const line of wrapLines(stripHtml(section.bodyHtml), charsPerLine)) {
      drawLine(line, { size: 9.5 });
    }
    y -= 5;
  }

  y -= 10;
  ensureSpace(40);
  drawLine("Electronic signature certificate", {
    bold: true,
    size: 10,
    color: ACCENT,
  });
  drawLine(
    `Signed by ${params.input.contactName || "Carrier contact"} on behalf of ${params.input.companyName || "Carrier"}.`,
    { size: 9 },
  );
  drawLine(
    `Email: ${params.input.email}${params.input.phone ? `  ·  Phone: ${params.input.phone}` : ""}`,
    { size: 9, color: MUTED },
  );
  drawLine(
    "This PDF is the official electronically signed record retained by Alpha Freight Network.",
    { size: 8, color: MUTED },
  );

  const bytes = await doc.save();
  const safeCompany =
    params.input.companyName
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "carrier";
  const filename = `AFN-signed-agreement-${safeCompany}-${CARRIER_AGREEMENT_TERMS_VERSION}.pdf`;

  return { pdf: Buffer.from(bytes), filename };
}
