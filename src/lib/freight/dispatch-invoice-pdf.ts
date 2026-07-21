import fs from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CarrierDispatchInvoice, InvoiceIssuer } from "./dispatch-invoice";
import { formatInvoiceDate } from "./dispatch-invoice";
import type { InvoicePaymentDetails } from "./dispatch-invoice-payment";

const LOGO_SIZE = 56;

/** Invisible sheet chars (e.g. U+202C) break pdf-lib WinAnsi Helvetica encoding. */
function sanitizePdfText(text: string): string {
  return text
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u206F\uFEFF]/g, "")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[^\t\n\r\x20-\x7E]/g, "")
    .trim();
}

function formatMoney(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

async function loadLogoBytes(): Promise<Uint8Array | null> {
  const candidates = [
    path.join(process.cwd(), "public", "alpha-logo.png"),
    path.join(process.cwd(), "alpha-solutions", "public", "alpha-logo.png"),
  ];

  for (const filePath of candidates) {
    try {
      return await fs.readFile(filePath);
    } catch {
      /* try next path */
    }
  }

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://www.alphasolutions.software";

  try {
    const res = await fetch(`${siteUrl}/alpha-logo.png`, { cache: "force-cache" });
    if (res.ok) {
      return new Uint8Array(await res.arrayBuffer());
    }
  } catch {
    /* logo optional */
  }

  return null;
}

export async function renderCarrierInvoicePdf(
  invoice: CarrierDispatchInvoice,
  issuer: InvoiceIssuer,
  payment: InvoicePaymentDetails,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(sanitizePdfText(`Invoice ${invoice.invoiceNumber} ${invoice.carrierName}`));
  pdf.setAuthor(sanitizePdfText(issuer.contactName));
  const page = pdf.addPage([612, 792]);
  const { width, height } = page.getSize();
  const margin = 50;
  const contentWidth = width - margin * 2;

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.07, 0.07, 0.07);
  const muted = rgb(0.4, 0.4, 0.4);
  const accent = rgb(0.15, 0.39, 0.92);

  const logoBytes = await loadLogoBytes();
  let logoBottom = height - margin;

  if (logoBytes) {
    const logo = await pdf.embedPng(logoBytes);
    const scale = LOGO_SIZE / Math.max(logo.width, logo.height);
    const logoW = logo.width * scale;
    const logoH = logo.height * scale;
    const logoY = height - margin - logoH;

    page.drawImage(logo, {
      x: margin,
      y: logoY,
      width: logoW,
      height: logoH,
    });

    logoBottom = logoY;
  }

  const textX = logoBytes ? margin + LOGO_SIZE + 14 : margin;
  let textY = height - margin - 11;

  const drawAt = (
    text: string,
    x: number,
    yPos: number,
    size: number,
    font = regular,
    color = dark,
  ) => {
    const safe = sanitizePdfText(text);
    if (!safe) return;
    page.drawText(safe, { x, y: yPos, size, font, color });
  };

  drawAt(issuer.contactName, textX, textY, 11);
  textY -= 14;
  drawAt(issuer.companyName, textX, textY, 11);
  textY -= 14;
  drawAt(issuer.addressLine1, textX, textY, 11);
  textY -= 14;
  drawAt(issuer.addressLine2, textX, textY, 11);

  let y = Math.min(textY - 20, logoBottom - 20);

  const invoiceLabel = sanitizePdfText(`# ${invoice.invoiceNumber} ${invoice.carrierName}`);
  const dateStr = sanitizePdfText(formatInvoiceDate(invoice.invoiceDate));
  const dateWidth = regular.widthOfTextAtSize(dateStr, 11);

  page.drawText(invoiceLabel, {
    x: margin,
    y,
    size: 11,
    font: regular,
    color: dark,
    maxWidth: contentWidth - dateWidth - 16,
  });
  page.drawText(dateStr, {
    x: width - margin - dateWidth,
    y,
    size: 11,
    font: regular,
    color: dark,
  });

  y -= 28;
  drawAt("Invoice", margin, y, 22, bold);

  y -= 28;
  const billTop = y;
  drawAt("BILL TO", margin, billTop, 10, regular, muted);
  drawAt("PAYMENT", margin + contentWidth / 2 + 10, billTop, 10, regular, muted);

  y -= 16;
  let billY = y;

  if (invoice.billTo.contactName) {
    drawAt(invoice.billTo.contactName, margin, billY, 11);
    billY -= 14;
  }
  drawAt(invoice.billTo.companyName, margin, billY, 11, bold);
  billY -= 14;

  if (invoice.billTo.addressLine) {
    for (const line of wrapText(invoice.billTo.addressLine, regular, 11, contentWidth / 2 - 10)) {
      drawAt(line, margin, billY, 11);
      billY -= 14;
    }
  }
  if (invoice.billTo.email) {
    drawAt(invoice.billTo.email, margin, billY, 11);
    billY -= 14;
  }
  if (invoice.billTo.phone) {
    drawAt(invoice.billTo.phone, margin, billY, 11);
    billY -= 14;
  }

  drawAt(
    `Due Date: ${formatInvoiceDate(invoice.dueDate)}`,
    margin + contentWidth / 2 + 10,
    billTop - 16,
    11,
  );

  y = Math.min(billY, billTop - 32) - 28;
  y = drawLineItemsTable(page, invoice, {
    y,
    margin,
    width,
    contentWidth,
    regular,
    bold,
    dark,
    muted,
  });

  y -= 36;
  drawAt(payment.heading, margin, y, 11, bold);
  y -= 16;

  for (const line of payment.lines) {
    drawAt(line, margin, y, 10);
    y -= 14;
  }

  y -= 18;
  drawAt("TERMS", margin, y, 10, bold, muted);
  y -= 14;
  page.drawText(sanitizePdfText(`Thank you for choosing ${issuer.companyName}.`), {
    x: margin,
    y,
    size: 10,
    font: regular,
    color: dark,
    maxWidth: contentWidth,
  });
  y -= 14;
  page.drawText(sanitizePdfText(issuer.website), {
    x: margin,
    y,
    size: 10,
    font: regular,
    color: accent,
  });

  const bytes = await pdf.save();
  return Buffer.from(bytes);
}

function drawLineItemsTable(
  page: PDFPage,
  invoice: CarrierDispatchInvoice,
  ctx: {
    y: number;
    margin: number;
    width: number;
    contentWidth: number;
    regular: PDFFont;
    bold: PDFFont;
    dark: ReturnType<typeof rgb>;
    muted: ReturnType<typeof rgb>;
  },
): number {
  let { y } = ctx;
  const { margin, width, contentWidth, regular, bold, dark, muted } = ctx;

  const colItem = margin;
  const colQty = margin + contentWidth * 0.62;
  const colRate = margin + contentWidth * 0.74;
  const colAmount = margin + contentWidth * 0.86;

  page.drawText(sanitizePdfText("ITEM"), { x: colItem, y, size: 9, font: bold, color: muted });
  page.drawText(sanitizePdfText("QUANTITY"), { x: colQty, y, size: 9, font: bold, color: muted });
  page.drawText(sanitizePdfText("RATE"), { x: colRate, y, size: 9, font: bold, color: muted });
  page.drawText(sanitizePdfText("AMOUNT"), { x: colAmount, y, size: 9, font: bold, color: muted });

  y -= 10;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });

  y -= 16;
  for (const item of invoice.lineItems) {
    const descLines = wrapText(item.description, regular, 9, contentWidth * 0.58);
    for (let i = 0; i < descLines.length; i++) {
      page.drawText(descLines[i], {
        x: colItem,
        y: y - i * 12,
        size: 9,
        font: regular,
        color: dark,
      });
    }

    const rowHeight = Math.max(descLines.length * 12, 14);
    page.drawText(String(item.quantity), {
      x: colQty,
      y,
      size: 9,
      font: regular,
      color: dark,
    });
    page.drawText(sanitizePdfText(formatMoney(item.rate)), {
      x: colRate,
      y,
      size: 9,
      font: regular,
      color: dark,
    });
    page.drawText(sanitizePdfText(formatMoney(item.amount)), {
      x: colAmount,
      y,
      size: 9,
      font: regular,
      color: dark,
    });
    y -= rowHeight + 8;

    if (y < 120) break;
  }

  y -= 8;
  page.drawLine({
    start: { x: margin, y },
    end: { x: width - margin, y },
    thickness: 0.5,
    color: rgb(0.8, 0.8, 0.8),
  });
  y -= 16;
  page.drawText(sanitizePdfText("Total"), { x: colRate - 20, y, size: 11, font: bold, color: dark });
  page.drawText(sanitizePdfText(formatMoney(invoice.total)), {
    x: colAmount,
    y,
    size: 11,
    font: bold,
    color: dark,
  });

  return y;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const clean = sanitizePdfText(text);
  if (!clean) return [""];

  const words = clean.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(test, size) <= maxWidth) {
      line = test;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [clean];
}
