import { readFile } from "fs/promises";
import path from "path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import {
  RATE_CON_TERMS_VERSION,
  buildRateConSections,
} from "@/lib/freight/rate-confirmations";

const ACCENT = rgb(0.22, 0.64, 1);
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

async function embedAfnLogo(doc: PDFDocument) {
  try {
    const logoPath = path.join(process.cwd(), "public", "afn-logo.png");
    const bytes = await readFile(logoPath);
    return await doc.embedPng(bytes);
  } catch {
    return null;
  }
}

export async function buildRateConfirmationPdf(params: {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  loadNumber?: string | null;
  broker?: string | null;
  lane?: string | null;
  rateAmount: number;
  dispatchPercent?: number | null;
  termsVersion?: string;
  acceptedAt?: string;
  acceptedIp?: string | null;
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
    page.drawText("Electronically signed rate confirmation", {
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

  drawWrapped("Rate Confirmation", {
    bold: true,
    size: 14,
    color: ACCENT,
    gapAfter: 4,
  });

  const terms = params.termsVersion || RATE_CON_TERMS_VERSION;
  drawWrapped(`Terms version: ${terms}`, {
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

  const sections = buildRateConSections({
    company_name: params.companyName,
    load_number: params.loadNumber,
    broker: params.broker,
    lane: params.lane,
    rate_amount: params.rateAmount,
    dispatch_percent: params.dispatchPercent,
    terms_version: terms,
  });

  for (const section of sections) {
    ensureSpace(36);
    drawWrapped(section.title, {
      bold: true,
      size: 11,
      color: ACCENT,
      gapAfter: 2,
    });
    drawWrapped(stripHtml(section.bodyHtml), { size: 9.5, gapAfter: 8 });
  }

  ensureSpace(48);
  drawWrapped("Electronic signature certificate", {
    bold: true,
    size: 10,
    color: ACCENT,
    gapAfter: 2,
  });
  drawWrapped(
    `Signed by ${params.contactName || "Carrier contact"} on behalf of ${params.companyName || "Carrier"}.`,
    { size: 9 },
  );
  drawWrapped(
    `Email: ${params.email}${params.phone ? ` | Phone: ${params.phone}` : ""}`,
    { size: 9, color: MUTED },
  );
  drawWrapped(
    "This PDF is the official electronically signed rate confirmation retained by Alpha Freight Network.",
    { size: 8, color: MUTED },
  );

  const bytes = await doc.save();
  const safeLoad =
    String(params.loadNumber || "load")
      .trim()
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 24) || "load";
  const filename = `AFN-rate-con-${safeLoad}-${terms}.pdf`;

  return { pdf: Buffer.from(bytes), filename };
}
