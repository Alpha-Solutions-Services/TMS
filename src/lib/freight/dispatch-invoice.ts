import type { CarrierRosterEntry } from "./carrier-sheet";
import type { DashboardLoad } from "./dispatch-dashboard-types";
import {
  buildCarrierContactIndex,
  enrichLoadsWithCarrierRoster,
  lookupCarrierContact,
  normalizeCompanyKey,
  preferCarrierDisplayName,
  resolveCarrierEmail,
} from "./carrier-contact";

export type InvoiceIssuer = {
  contactName: string;
  companyName: string;
  brandName: string;
  addressLine1: string;
  addressLine2: string;
  zelleNumber: string;
  zelleName: string;
  zelleNumber2: string;
  zelleName2: string;
  zelleEmail2: string;
  website: string;
  emailFrom: string;
};

export type InvoiceLineItem = {
  loadNumber: string;
  sr: string;
  description: string;
  emailSummary: string;
  quantity: number;
  rate: number;
  amount: number;
};

export type CarrierDispatchInvoice = {
  invoiceNumber: string;
  carrierName: string;
  invoiceDate: Date;
  dueDate: Date;
  billTo: {
    contactName: string;
    companyName: string;
    addressLine: string;
    email: string;
    phone: string;
  };
  lineItems: InvoiceLineItem[];
  total: number;
};

export function getDefaultIssuer(): InvoiceIssuer {
  return {
    contactName: process.env.DISPATCH_INVOICE_CONTACT_NAME?.trim() || "Muhammad Mikran",
    companyName:
      process.env.DISPATCH_INVOICE_COMPANY_NAME?.trim() || "Alpha Solutions Services LLC",
    brandName: process.env.DISPATCH_INVOICE_BRAND_NAME?.trim() || "Alpha Freight Network",
    addressLine1:
      process.env.DISPATCH_INVOICE_ADDRESS_LINE1?.trim() ||
      "7533 S Center View Ct Ste R, West Jordan, UT",
    addressLine2: process.env.DISPATCH_INVOICE_ADDRESS_LINE2?.trim() || "84084 US",
    zelleNumber: process.env.DISPATCH_INVOICE_ZELLE_NUMBER?.trim() || "+1 (908) 848-9815",
    zelleName: process.env.DISPATCH_INVOICE_ZELLE_NAME?.trim() || "Suzy Agon",
    zelleNumber2: process.env.DISPATCH_INVOICE_ZELLE_NUMBER_2?.trim() || "(332) 263-3544",
    zelleName2: process.env.DISPATCH_INVOICE_ZELLE_NAME_2?.trim() || "Maliha Shahid",
    zelleEmail2:
      process.env.DISPATCH_INVOICE_ZELLE_EMAIL_2?.trim() || "malihaawais1997@gmail.com",
    website:
      process.env.DISPATCH_INVOICE_WEBSITE?.trim() || "https://www.alphasolutions.software/",
    emailFrom:
      process.env.DISPATCH_INVOICE_FROM?.trim() ||
      "Alpha Invoice & Payment <invoice.payment.alpha@gmail.com>",
  };
}

/** Invoices are issued on Friday; due the same Friday. */
export function getInvoiceFriday(reference = new Date()): Date {
  const d = new Date(reference);
  d.setHours(12, 0, 0, 0);
  const day = d.getDay();
  const daysUntilFriday = (5 - day + 7) % 7;
  d.setDate(d.getDate() + daysUntilFriday);
  return d;
}

export function formatInvoiceDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatPickupDelivery(value: string): string {
  if (!value || value === "—") return "";
  return value.trim();
}

function normalizeStatus(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function computeDispatchFee(load: DashboardLoad): number {
  if (load.dispatch_fee > 0) return load.dispatch_fee;
  if (load.rate > 0 && load.dispatch_percent > 0) {
    return Math.round((load.rate * load.dispatch_percent) / 100 * 100) / 100;
  }
  return 0;
}

function isUnpaidStatus(status: string): boolean {
  const s = normalizeStatus(status);
  if (!s || s === "—" || s === "-") return false;
  // Payment STATUS only — do NOT treat invoice workflow "Pending" as unpaid.
  return s === "unpaid" || s.includes("unpaid") || s === "due" || s.endsWith(" due");
}

function isPartialStatus(status: string): boolean {
  const s = normalizeStatus(status);
  return s.includes("partial") || s.includes("part paid") || s.includes("partly");
}

function isPaidStatus(status: string): boolean {
  const s = normalizeStatus(status);
  if (!s || s === "—" || s === "-") return false;
  if (isUnpaidStatus(s) || isPartialStatus(s)) return false;
  return s === "paid" || s.includes("paid in full") || s.startsWith("paid");
}

/** True when the sheet STATUS column (payment) shows this dispatch fee is fully paid. */
export function isDispatchFeePaid(load: DashboardLoad): boolean {
  const status = load.status;

  // Payment STATUS wins over invoice workflow column (Pending/Sent/etc).
  if (isPaidStatus(status)) return true;
  if (isUnpaidStatus(status)) return false;
  if (isPartialStatus(status)) return false;

  const fee = computeDispatchFee(load);
  if (fee <= 0) return true;
  if (load.balance > 0) return false;
  if (load.received >= fee && load.received > 0) return true;

  return false;
}

/** Remaining dispatch fee to bill — excludes fully paid loads; partial uses balance or received. */
export function computeOutstandingDispatchFee(load: DashboardLoad): number {
  const fee = computeDispatchFee(load);
  if (fee <= 0) return 0;
  if (isDispatchFeePaid(load)) return 0;

  if (load.balance > 0) {
    return Math.round(Math.min(load.balance, fee) * 100) / 100;
  }

  if (
    isPartialStatus(load.status) ||
    load.received > 0
  ) {
    const remaining = fee - Math.max(load.received, 0);
    return Math.max(0, Math.round(remaining * 100) / 100);
  }

  return fee;
}

function formatMoneyUsd(n: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

export function buildLineItemEmailSummary(load: DashboardLoad, amount: number): string {
  const broker = load.broker !== "—" ? load.broker : "Load";
  const loadNo =
    load.load_number && load.load_number !== "—"
      ? load.load_number
      : load.load_id.replace(/^LD-/, "");
  return `${broker} – Load #${loadNo} – ${formatMoneyUsd(amount)}`;
}

export function buildLineItemDescription(load: DashboardLoad): string {
  const broker = load.broker !== "—" ? load.broker : "Load";
  const pu = formatPickupDelivery(load.pickup);
  const dl = formatPickupDelivery(load.delivery);
  const miles = load.miles > 0 ? ` ${load.miles}` : "";
  const loadNo =
    load.load_number && load.load_number !== "—"
      ? load.load_number
      : load.load_id.replace(/^LD-/, "");
  const states = load.states !== "—" ? load.states : "";
  const rc = load.rate > 0 ? `$${load.rate.toLocaleString("en-US")}` : "$0";
  const pct = load.dispatch_percent > 0 ? `${load.dispatch_percent}%` : "";

  const parts = [
    broker,
    pu ? `PU ${pu}` : "",
    dl ? `DL ${dl}${miles}` : miles ? `Miles${miles}` : "",
    `Load No: ${loadNo}`,
    states,
    rc,
    pct,
  ].filter(Boolean);

  return parts.join(", ");
}

/** Company name on sheet, or Booked By as fallback for grouping. */
export function resolveCarrierName(load: DashboardLoad): string {
  const company = load.carrier?.trim();
  if (company && company !== "—") return company;
  const booked = load.booked_by?.trim();
  if (booked && booked !== "—") return booked;
  return "";
}

export function isInvoiceableLoad(load: DashboardLoad): boolean {
  if (!resolveCarrierName(load)) return false;
  // Already emailed (Sent) or closed — manage payment on the Sent tab, do not re-bill.
  const inv = normalizeStatus(load.invoice_status ?? "");
  if (inv === "paid" || inv === "sent" || inv === "partial") return false;
  return computeOutstandingDispatchFee(load) > 0;
}

function normalizeEmailKey(email: string | undefined | null): string {
  const v = email?.trim().toLowerCase() ?? "";
  return v.includes("@") && v !== "—" ? v : "";
}

/**
 * One invoice per carrier. Same email (sheet or roster) or same normalized
 * company name collapses into a single group.
 */
export function groupLoadsByCarrier(
  loads: DashboardLoad[],
  carrierRoster: CarrierRosterEntry[] = [],
): Map<string, DashboardLoad[]> {
  const rosterIndex = buildCarrierContactIndex(carrierRoster);
  const enriched = enrichLoadsWithCarrierRoster(loads, carrierRoster);
  const invoiceable = enriched.filter(isInvoiceableLoad);
  const n = invoiceable.length;

  const parent = Array.from({ length: n }, (_, i) => i);
  function find(i: number): number {
    if (parent[i] !== i) parent[i] = find(parent[i]!);
    return parent[i]!;
  }
  function union(i: number, j: number) {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  }

  const emailFirst = new Map<string, number>();
  const nameFirst = new Map<string, number>();

  for (let i = 0; i < n; i++) {
    const load = invoiceable[i]!;
    const nameKey = normalizeCompanyKey(resolveCarrierName(load));
    const emailKey =
      normalizeEmailKey(load.email) ||
      normalizeEmailKey(resolveCarrierEmail([load], rosterIndex));

    if (emailKey) {
      const prev = emailFirst.get(emailKey);
      if (prev !== undefined) union(i, prev);
      else emailFirst.set(emailKey, i);
    }
    if (nameKey) {
      const prev = nameFirst.get(nameKey);
      if (prev !== undefined) union(i, prev);
      else nameFirst.set(nameKey, i);
    }
  }

  type Bucket = { display: string; loads: DashboardLoad[] };
  const buckets = new Map<number, Bucket>();

  for (let i = 0; i < n; i++) {
    const load = invoiceable[i]!;
    const raw = resolveCarrierName(load);
    const root = find(i);
    const existing = buckets.get(root);
    if (!existing) {
      buckets.set(root, { display: raw, loads: [load] });
      continue;
    }
    existing.loads.push(load);
    existing.display = preferCarrierDisplayName(existing.display, raw);
  }

  const map = new Map<string, DashboardLoad[]>();
  for (const { display, loads: list } of buckets.values()) {
    list.sort((a, b) => Number(a.sr) - Number(b.sr));
    map.set(display, list);
  }
  return map;
}

export type CarrierInvoiceGroup = {
  carrier: string;
  loads: DashboardLoad[];
  email: string;
  loadNumbers: string;
  total: number;
  lineCount: number;
};

/** UI safety net: merge invoice rows that share the same displayed email. */
export function mergeCarrierGroupsByEmail(
  groups: CarrierInvoiceGroup[],
): CarrierInvoiceGroup[] {
  const map = new Map<string, CarrierInvoiceGroup>();

  for (const group of groups) {
    const emailKey = normalizeEmailKey(group.email);
    const key = emailKey
      ? `email:${emailKey}`
      : `name:${normalizeCompanyKey(group.carrier)}`;

    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...group, loads: [...group.loads] });
      continue;
    }

    const loads = [...existing.loads, ...group.loads].sort(
      (a, b) => Number(a.sr) - Number(b.sr),
    );
    const total = loads.reduce(
      (s, load) => s + computeOutstandingDispatchFee(load),
      0,
    );

    map.set(key, {
      carrier: preferCarrierDisplayName(existing.carrier, group.carrier),
      loads,
      email: existing.email || group.email,
      loadNumbers: loads
        .map((l) => (l.load_number !== "—" ? l.load_number : `SR-${l.sr}`))
        .join(", "),
      total: Math.round(total * 100) / 100,
      lineCount: loads.length,
    });
  }

  return Array.from(map.values()).sort((a, b) =>
    a.carrier.localeCompare(b.carrier),
  );
}

export function buildCarrierInvoices(
  loads: DashboardLoad[],
  opts?: {
    carriers?: string[];
    invoiceDate?: Date;
    startNumber?: number;
    invoiceNumbersByCarrier?: Record<string, string>;
    carrierRoster?: CarrierRosterEntry[];
  },
): CarrierDispatchInvoice[] {
  const enriched = enrichLoadsWithCarrierRoster(
    loads,
    opts?.carrierRoster ?? [],
  );
  const grouped = groupLoadsByCarrier(enriched, opts?.carrierRoster ?? []);
  const invoiceDate = opts?.invoiceDate ?? getInvoiceFriday();
  const dueDate = invoiceDate;
  let nextAutoNumber = opts?.startNumber ?? 1;

  const rosterIndex = buildCarrierContactIndex(opts?.carrierRoster ?? []);
  const customNumbers = opts?.invoiceNumbersByCarrier ?? {};

  const carrierFilterKeys = opts?.carriers
    ?.map((c) => normalizeCompanyKey(c))
    .filter(Boolean);
  const invoices: CarrierDispatchInvoice[] = [];

  const sortedCarriers = Array.from(grouped.keys()).sort((a, b) => a.localeCompare(b));

  for (const carrierName of sortedCarriers) {
    const carrierKey = normalizeCompanyKey(carrierName);
    if (
      carrierFilterKeys?.length &&
      !carrierFilterKeys.includes(carrierKey)
    ) {
      continue;
    }

    const custom =
      customNumbers[carrierName]?.trim() ||
      Object.entries(customNumbers).find(
        ([name]) => normalizeCompanyKey(name) === carrierKey,
      )?.[1]?.trim();
    const invoiceNumber = custom || String(nextAutoNumber);
    if (!custom) nextAutoNumber += 1;

    const carrierLoads = grouped.get(carrierName)!;
    const first = carrierLoads[0];
    const rosterEntry = lookupCarrierContact(rosterIndex, carrierName);
    const carrierEmail = resolveCarrierEmail(carrierLoads, rosterIndex);

    const lineItems: InvoiceLineItem[] = carrierLoads
      .map((load) => {
        const amount = computeOutstandingDispatchFee(load);
        return {
          loadNumber:
            load.load_number !== "—" ? load.load_number : load.sr,
          sr: load.sr,
          description: buildLineItemDescription(load),
          emailSummary: buildLineItemEmailSummary(load, amount),
          quantity: 1,
          rate: amount,
          amount,
        };
      })
      .filter((li) => li.amount > 0);

    const total = lineItems.reduce((s, li) => s + li.amount, 0);
    if (lineItems.length === 0 || total <= 0) continue;

    invoices.push({
      invoiceNumber: invoiceNumber.trim(),
      carrierName,
      invoiceDate,
      dueDate,
      billTo: {
        contactName:
          first.broker_agent !== "—"
            ? first.broker_agent
            : rosterEntry?.contactName ?? "",
        companyName: carrierName,
        addressLine:
          first.load_details !== "—"
            ? first.load_details
            : rosterEntry?.address ?? "",
        email: carrierEmail,
        phone:
          first.phone !== "—" ? first.phone : rosterEntry?.phone ?? "",
      },
      lineItems,
      total,
    });
  }

  return invoices;
}

export function invoicePdfFilename(invoice: CarrierDispatchInvoice): string {
  const safe = invoice.carrierName.replace(/[<>:"/\\|?*]/g, "").trim();
  return `Invoice ${invoice.invoiceNumber} ${safe}.pdf`;
}
