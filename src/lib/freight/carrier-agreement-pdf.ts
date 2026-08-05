import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  CARRIER_AGREEMENT_TERMS_VERSION,
  buildCarrierAgreementOnlySections,
  buildCarrierTermsOfServiceSections,
  type CarrierAgreementTermsInput,
} from "@/lib/freight/carrier-agreement-terms";

const ACCENT = rgb(0.22, 0.64, 1); // #38a3ff
const INK = rgb(0.05, 0.08, 0.12);
const MUTED = rgb(0.35, 0.42, 0.5);
const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 50;
const CONTENT_W = PAGE_W - MARGIN * 2;

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<\/li>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\u00a0/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sanitizePdfText(text: string): string {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, "-")
    .replace(/…/g, "...")
    .replace(/·/g, "|")
    .replace(/[^\x09\x0A\x0D\x20-\x7E]/g, "");
}

/** Wrap by measured font width so long URLs / lines never overflow the page. */
function wrapByWidth(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const cleaned = sanitizePdfText(text);
  const paragraphs = cleaned.split("\n");
  const lines: string[] = [];

  for (const paragraph of paragraphs) {
    const raw = paragraph.trimEnd();
    if (!raw) {
      lines.push("");
      continue;
    }

    const words = raw.split(/\s+/).filter(Boolean);
    // No spaces (e.g. long URL) — hard-break by width
    if (words.length === 1) {
      let chunk = "";
      for (const ch of words[0]) {
        const next = chunk + ch;
        if (font.widthOfTextAtSize(next, size) <= maxWidth) {
          chunk = next;
        } else {
          if (chunk) lines.push(chunk);
          chunk = ch;
        }
      }
      if (chunk) lines.push(chunk);
      continue;
    }

    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        current = candidate;
        continue;
      }

      if (current) lines.push(current);

      // Single word wider than maxWidth — hard-break the word
      if (font.widthOfTextAtSize(word, size) > maxWidth) {
        let piece = "";
        for (const ch of word) {
          const next = piece + ch;
          if (font.widthOfTextAtSize(next, size) <= maxWidth) {
            piece = next;
          } else {
            if (piece) lines.push(piece);
            piece = ch;
          }
        }
        current = piece;
      } else {
        current = word;
      }
    }
    if (current) lines.push(current);
  }

  return lines;
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

  let page: PDFPage = doc.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  const newPage = () => {
    page = doc.addPage([PAGE_W, PAGE_H]);
    y = PAGE_H - MARGIN;
  };

  const ensureSpace = (needed: number) => {
    if (y < MARGIN + needed) newPage();
  };

  const drawWrapped = (
    text: string,
    opts?: {
      bold?: boolean;
      size?: number;
      color?: ReturnType<typeof rgb>;
      gapAfter?: number;
    },
  ) => {
    const size = opts?.size ?? 10;
    const useFont = opts?.bold ? bold : font;
    const color = opts?.color ?? INK;
    const lineGap = size + 3.5;
    const lines = wrapByWidth(text, useFont, size, CONTENT_W);

    for (const line of lines) {
      ensureSpace(lineGap + 2);
      if (line) {
        page.drawText(line, {
          x: MARGIN,
          y,
          size,
          font: useFont,
          color,
        });
      }
      y -= lineGap;
    }
    if (opts?.gapAfter) y -= opts.gapAfter;
  };

  // Brand header
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 96,
    width: PAGE_W,
    height: 96,
    color: rgb(0.02, 0.05, 0.1),
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 100,
    width: PAGE_W,
    height: 4,
    color: ACCENT,
  });

  if (logo) {
    const logoH = 64;
    const logoW = Math.min((logo.width / logo.height) * logoH, 72);
    page.drawImage(logo, {
      x: MARGIN,
      y: PAGE_H - 88,
      width: logoW,
      height: logoH,
    });
    const textX = MARGIN + logoW + 14;
    page.drawText("ALPHA FREIGHT NETWORK", {
      x: textX,
      y: PAGE_H - 48,
      size: 13,
      font: bold,
      color: rgb(1, 1, 1),
    });
    page.drawText("Electronically signed carrier agreement", {
      x: textX,
      y: PAGE_H - 66,
      size: 9,
      font,
      color: ACCENT,
    });
  } else {
    page.drawText("ALPHA FREIGHT NETWORK", {
      x: MARGIN,
      y: PAGE_H - 48,
      size: 16,
      font: bold,
      color: rgb(1, 1, 1),
    });
  }

  y = PAGE_H - 118;

  drawWrapped("Carrier Dispatch Services Agreement", {
    bold: true,
    size: 14,
    color: ACCENT,
    gapAfter: 4,
  });

  drawWrapped(`Terms version: ${CARRIER_AGREEMENT_TERMS_VERSION}`, {
    bold: true,
    size: 9,
    color: MUTED,
  });
  if (params.acceptedAt) {
    drawWrapped(
      `Electronically accepted: ${new Date(params.acceptedAt).toLocaleString(
        "en-US",
        { dateStyle: "long", timeStyle: "short" },
      )}`,
      { size: 9 },
    );
  }
  if (params.acceptedIp) {
    drawWrapped(`Acceptance IP: ${params.acceptedIp}`, {
      size: 9,
      color: MUTED,
    });
  }
  if (params.signedUrl) {
    drawWrapped(`Signed record: ${params.signedUrl}`, {
      size: 8,
      color: ACCENT,
    });
  }
  if (params.inviteUrl) {
    drawWrapped(`TMS invite: ${params.inviteUrl}`, { size: 8, color: MUTED });
  }

  y -= 6;
  ensureSpace(8);
  page.drawRectangle({
    x: MARGIN,
    y: y - 1,
    width: CONTENT_W,
    height: 1.5,
    color: ACCENT,
  });
  y -= 14;

  for (const section of buildCarrierAgreementOnlySections(params.input)) {
    ensureSpace(36);
    drawWrapped(section.title, {
      bold: true,
      size: 11,
      color: ACCENT,
      gapAfter: 2,
    });
    drawWrapped(stripHtml(section.bodyHtml), { size: 9.5, gapAfter: 8 });
  }

  ensureSpace(40);
  drawWrapped("Terms of Service", {
    bold: true,
    size: 12,
    color: ACCENT,
    gapAfter: 2,
  });
  drawWrapped(
    "The following Terms of Service are incorporated into and form part of this Agreement.",
    { size: 9.5 },
  );
  drawWrapped(`Also published at: ${termsOfServiceUrl()}`, {
    size: 8.5,
    color: MUTED,
    gapAfter: 6,
  });

  for (const section of buildCarrierTermsOfServiceSections()) {
    ensureSpace(32);
    drawWrapped(section.title, {
      bold: true,
      size: 10.5,
      color: ACCENT,
      gapAfter: 2,
    });
    drawWrapped(stripHtml(section.bodyHtml), { size: 9.5, gapAfter: 7 });
  }

  ensureSpace(48);
  drawWrapped("Electronic signature certificate", {
    bold: true,
    size: 10,
    color: ACCENT,
    gapAfter: 2,
  });
  drawWrapped(
    `Signed by ${params.input.contactName || "Carrier contact"} on behalf of ${params.input.companyName || "Carrier"}.`,
    { size: 9 },
  );
  drawWrapped(
    `Email: ${params.input.email}${params.input.phone ? ` | Phone: ${params.input.phone}` : ""}`,
    { size: 9, color: MUTED },
  );
  drawWrapped(
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
