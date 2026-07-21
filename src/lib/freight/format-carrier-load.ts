import type { ParsedLoadFields } from "./parse-load-board";

const EQUIP_LABELS: Record<string, string> = {
  SB: "Step Deck (SB)",
  FB: "Flatbed (FB)",
  R: "Reefer",
};

/** Turn parsed load fields into a carrier-ready post (copy/paste to chat or SMS). */
export function formatCarrierReadyPost(fields: ParsedLoadFields): string {
  const equipParts: string[] = [];
  const rawEquip = fields.truckTrailer.split(" · ").map((e) => e.trim()).filter(Boolean);
  for (const e of rawEquip) {
    if (/lbs|ft|full|partial/i.test(e)) continue;
    equipParts.push(EQUIP_LABELS[e] ?? e);
  }

  const weight = fields.notes.match(/(\d{1,5})\s*lbs/i)?.[1];
  const length = fields.notes.match(/(\d{1,2})\s*ft/i)?.[1];
  const fullPartial = fields.notes.match(/\b(Full|Partial)\b/i)?.[1];

  const lines = [
    fields.rcInvoice ? `$${fields.rcInvoice}` : null,
    fields.miles ? `${fields.miles} mi` : null,
    fields.loadDetails || null,
    fields.pickupDateTime ? `Pickup ${fields.pickupDateTime}` : null,
    equipParts.length ? equipParts.join(" · ") : null,
    weight ? `${weight} lbs` : null,
    length ? `${length} ft` : null,
    fullPartial ?? null,
  ].filter(Boolean);

  return lines.join("\n");
}

/** Extract a load-board line from free text or chat context. */
export function extractLoadBoardLine(text: string): string | null {
  const lines = text.split(/\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/\$[\d,]+/.test(line) && /[A-Z]{2}/.test(line)) return line;
  }
  const oneLine = text.replace(/\s+/g, " ").trim();
  if (/\$[\d,]+/.test(oneLine) && /[A-Z]{2}/.test(oneLine)) return oneLine;
  return null;
}

export function wantsLoadFormatting(message: string): boolean {
  return (
    /make this|good looking|good.?look|format this|carrier.?ready|polish|rewrite|clean.?up|fix this/i.test(
      message,
    ) || /\bg+g+o+\b/i.test(message)
  );
}
