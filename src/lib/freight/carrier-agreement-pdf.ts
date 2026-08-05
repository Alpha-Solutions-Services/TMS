import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  CARRIER_AGREEMENT_TERMS_VERSION,
  buildCarrierAgreementPlainText,
  buildCarrierTermsOfServiceSections,
  type CarrierAgreementTermsInput,
} from "@/lib/freight/carrier-agreement-terms";

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

export async function buildCarrierAgreementPdf(params: {
  input: CarrierAgreementTermsInput;
  acceptedAt?: string;
  acceptedIp?: string | null;
  inviteUrl?: string;
}): Promise<{ pdf: Buffer; filename: string }> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const pageWidth = 612;
  const pageHeight = 792;
  const margin = 50;
  const maxWidth = pageWidth - margin * 2;
  const fontSize = 10;
  const lineHeight = 14;
  const charsPerLine = Math.floor(maxWidth / 5.2);

  let page = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - margin;

  const drawLine = (text: string, useBold = false) => {
    if (y < margin + lineHeight) {
      page = doc.addPage([pageWidth, pageHeight]);
      y = pageHeight - margin;
    }
    page.drawText(text, {
      x: margin,
      y,
      size: fontSize,
      font: useBold ? bold : font,
      color: rgb(0.05, 0.08, 0.12),
      maxWidth,
    });
    y -= lineHeight;
  };

  const title = "Carrier Dispatch Services Agreement";
  page.drawText(title, {
    x: margin,
    y,
    size: 16,
    font: bold,
    color: rgb(0.05, 0.08, 0.12),
  });
  y -= 22;

  drawLine(`Terms version: ${CARRIER_AGREEMENT_TERMS_VERSION}`, true);
  if (params.acceptedAt) {
    drawLine(
      `Accepted: ${new Date(params.acceptedAt).toLocaleString("en-US", {
        dateStyle: "long",
        timeStyle: "short",
      })}`,
    );
  }
  if (params.acceptedIp) drawLine(`IP: ${params.acceptedIp}`);
  if (params.inviteUrl) drawLine(`TMS invite: ${params.inviteUrl}`);
  y -= 8;

  const plain = buildCarrierAgreementPlainText(params.input);
  for (const line of wrapLines(plain, charsPerLine)) {
    drawLine(line);
  }

  y -= 10;
  drawLine("TERMS OF SERVICE (incorporated by reference)", true);
  y -= 4;

  for (const section of buildCarrierTermsOfServiceSections()) {
    drawLine(section.title, true);
    for (const line of wrapLines(stripHtml(section.bodyHtml), charsPerLine)) {
      drawLine(line);
    }
    y -= 4;
  }

  const bytes = await doc.save();
  const safeCompany =
    params.input.companyName
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "carrier";
  const filename = `carrier-agreement-${safeCompany}-${CARRIER_AGREEMENT_TERMS_VERSION}.pdf`;

  return { pdf: Buffer.from(bytes), filename };
}
