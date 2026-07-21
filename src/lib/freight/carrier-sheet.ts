import { parseCsvLine } from "./dispatch-sheet";

export type CarrierSheetRow = {
  mc: string;
  mcAge: string;
  contactName: string;
  phone: string;
  companyName: string;
  truck: string;
  email: string;
  address: string;
  dispatchReview: string;
  status: string;
  salesReview: string;
  salesAttention: string;
  documentLink: string;
};

export type CarrierRosterEntry = CarrierSheetRow & {
  id: string;
  source: "sheet" | "dispatcher" | "supabase";
  active: boolean;
  loadsBooked?: number;
};

export type TopBooker = {
  name: string;
  loads: number;
  revenue: number;
  commission: number;
};


function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function rowFromCells(cells: string[]): CarrierSheetRow | null {
  const padded = [...cells];
  while (padded.length < 13) padded.push("");

  const company = padded[4]?.trim() ?? "";
  const mc = padded[0]?.trim() ?? "";
  if (!company && !mc) return null;

  return {
    mc,
    mcAge: padded[1]?.trim() ?? "",
    contactName: padded[2]?.trim() ?? "",
    phone: padded[3]?.trim() ?? "",
    companyName: company || mc,
    truck: padded[5]?.trim() ?? "",
    email: padded[6]?.trim() ?? "",
    address: padded[7]?.trim() ?? "",
    dispatchReview: padded[8]?.trim() ?? "",
    status: padded[9]?.trim() ?? "",
    salesReview: padded[10]?.trim() ?? "",
    salesAttention: padded[11]?.trim() ?? "",
    documentLink: padded[12]?.trim() ?? "",
  };
}

function findCarrierHeaderIndex(lines: string[]): number {
  for (let i = 0; i < Math.min(lines.length, 10); i++) {
    const cells = parseCsvLine(lines[i]).map(normalizeHeader);
    if (cells.includes("mc") && cells.includes("company name")) return i;
  }
  return 0;
}

export function parseCarrierCsv(csv: string): CarrierSheetRow[] {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return [];

  const headerIndex = findCarrierHeaderIndex(lines);
  const rows: CarrierSheetRow[] = [];

  for (const line of lines.slice(headerIndex + 1)) {
    const row = rowFromCells(parseCsvLine(line));
    if (row) rows.push(row);
  }

  return rows;
}

function isCarrierCsv(csv: string): boolean {
  const head = csv.slice(0, 800).toLowerCase();
  return head.includes("mc") && head.includes("company name");
}

export async function fetchCarrierSheetCsv(): Promise<{
  csv: string | null;
  source: string;
}> {
  const csvUrl = process.env.GOOGLE_CARRIER_SHEET_CSV_URL?.trim();
  if (csvUrl) {
    const res = await fetch(csvUrl, { next: { revalidate: 60 } });
    if (!res.ok) return { csv: null, source: csvUrl };
    const text = await res.text();
    return { csv: isCarrierCsv(text) ? text : null, source: csvUrl };
  }

  const sheetId = process.env.GOOGLE_DISPATCH_SHEET_ID?.trim();
  if (!sheetId) return { csv: null, source: "none" };

  const tab =
    process.env.GOOGLE_CARRIER_SHEET_TAB?.trim() || "Carriers";
  const gid = process.env.GOOGLE_CARRIER_SHEET_GID?.trim();

  const attempts: string[] = [
    `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&sheet=${encodeURIComponent(tab)}`,
  ];
  if (gid) {
    attempts.push(
      `https://docs.google.com/spreadsheets/d/${sheetId}/export?format=csv&gid=${gid}`,
    );
  }

  for (const url of attempts) {
    const res = await fetch(url, { next: { revalidate: 60 } });
    if (!res.ok) continue;
    const text = await res.text();
    if (isCarrierCsv(text)) return { csv: text, source: url };
  }

  return { csv: null, source: "not-found" };
}

export function buildTopBookers(
  loads: { booked_by: string; rate: number; dispatch_fee: number }[],
): TopBooker[] {
  const map = new Map<string, TopBooker>();

  for (const load of loads) {
    const name = load.booked_by?.trim();
    if (!name || name === "—") continue;
    const existing = map.get(name) ?? {
      name,
      loads: 0,
      revenue: 0,
      commission: 0,
    };
    existing.loads += 1;
    existing.revenue += load.rate;
    existing.commission += load.dispatch_fee;
    map.set(name, existing);
  }

  return Array.from(map.values()).sort((a, b) => b.loads - a.loads || b.revenue - a.revenue);
}
