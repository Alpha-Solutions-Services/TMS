import { listAcademyStudents } from "./academy-db";
import {
  listSentInvoices,
  type SentInvoiceRecord,
} from "./dispatch-sent-invoices-db";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { parseRcDate } from "./dispatch-sheet-tabs";

export type AgingBucketId = "current" | "1_30" | "31_60" | "61_90" | "90_plus";

export type InvoiceAgingBucket = {
  id: AgingBucketId;
  label: string;
  count: number;
  amount: number;
};

export type InvoiceAgingReport = {
  asOf: string;
  totalOpen: number;
  totalOpenAmount: number;
  buckets: InvoiceAgingBucket[];
};

export type DispatcherReportsData = {
  generatedAt: string;
  loads: {
    total: number;
    miles: number;
    grossRevenue: number;
    commission: number;
    unpaidBalance: number;
    byMonth: { monthTab: string; loads: number; commission: number }[];
  };
  invoices: {
    sentTotal: number;
    paidCount: number;
    partialCount: number;
    unpaidCount: number;
    billedTotal: number;
    receivedTotal: number;
    openBalance: number;
    aging: InvoiceAgingReport;
  };
  academy: {
    studentsTotal: number;
    paid: number;
    pending: number;
    unpaid: number;
    refunded: number;
  };
  traffic: {
    pageViewsLast7Days: number;
    pageViewsLast30Days: number;
  };
};

const AGING_LABELS: { id: AgingBucketId; label: string }[] = [
  { id: "current", label: "Current (not due)" },
  { id: "1_30", label: "1–30 days" },
  { id: "31_60", label: "31–60 days" },
  { id: "61_90", label: "61–90 days" },
  { id: "90_plus", label: "90+ days" },
];

function startOfLocalDay(d = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function daysPastDue(dueDate: string, asOf: Date): number {
  const due = parseRcDate(dueDate) || new Date(`${dueDate}T12:00:00`);
  if (Number.isNaN(due.getTime())) return 0;
  const dueDay = startOfLocalDay(due);
  const today = startOfLocalDay(asOf);
  return Math.floor((today.getTime() - dueDay.getTime()) / 86_400_000);
}

function bucketForDaysPastDue(days: number): AgingBucketId {
  if (days <= 0) return "current";
  if (days <= 30) return "1_30";
  if (days <= 60) return "31_60";
  if (days <= 90) return "61_90";
  return "90_plus";
}

export function buildInvoiceAging(
  invoices: SentInvoiceRecord[],
  asOf = new Date(),
): InvoiceAgingReport {
  const buckets = AGING_LABELS.map((b) => ({
    id: b.id,
    label: b.label,
    count: 0,
    amount: 0,
  }));
  const byId = new Map(buckets.map((b) => [b.id, b]));

  let totalOpen = 0;
  let totalOpenAmount = 0;

  for (const inv of invoices) {
    if (inv.paymentStatus === "paid") continue;
    const open = Math.max(0, inv.amountTotal - inv.amountReceived);
    if (open <= 0 && inv.paymentStatus !== "unpaid") continue;
    const amount = open > 0 ? open : inv.amountTotal;
    if (amount <= 0) continue;

    const days = daysPastDue(inv.dueDate || inv.invoiceDate || inv.sentAt, asOf);
    const bucket = byId.get(bucketForDaysPastDue(days));
    if (!bucket) continue;
    bucket.count += 1;
    bucket.amount = Math.round((bucket.amount + amount) * 100) / 100;
    totalOpen += 1;
    totalOpenAmount = Math.round((totalOpenAmount + amount) * 100) / 100;
  }

  return {
    asOf: asOf.toISOString(),
    totalOpen,
    totalOpenAmount,
    buckets,
  };
}

async function countPageViewsSince(since: Date): Promise<number> {
  const admin = getServiceRoleClient();
  if (!admin) return 0;
  const { count, error } = await admin
    .from("page_views")
    .select("*", { count: "exact", head: true })
    .gte("created_at", since.toISOString());
  if (error) {
    console.warn("[dispatch-reports] page_views:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function buildDispatcherReports(): Promise<DispatcherReportsData> {
  const admin = getServiceRoleClient();
  const since7 = new Date();
  since7.setDate(since7.getDate() - 7);
  const since30 = new Date();
  since30.setDate(since30.getDate() - 30);

  let loadRows: {
    month_tab: string | null;
    miles: number | null;
    rc_invoice: number | null;
    dispatch_fee: number | null;
    balance: number | null;
    status: string | null;
    invoice: string | null;
  }[] = [];

  const [sentInvoices, students, pageViewsLast7Days, pageViewsLast30Days] =
    await Promise.all([
      listSentInvoices(),
      listAcademyStudents(),
      countPageViewsSince(since7),
      countPageViewsSince(since30),
    ]);

  if (admin) {
    const { data, error } = await admin
      .from("dispatch_loads")
      .select("month_tab, miles, rc_invoice, dispatch_fee, balance, status, invoice")
      .is("deleted_at", null);
    if (error) {
      console.warn("[dispatch-reports] loads:", error.message);
    } else {
      loadRows = (data ?? []) as typeof loadRows;
    }
  }

  const loads = loadRows;

  let miles = 0;
  let grossRevenue = 0;
  let commission = 0;
  let unpaidBalance = 0;
  const byMonthMap = new Map<string, { loads: number; commission: number }>();

  for (const row of loads) {
    const m = String(row.month_tab ?? "Unassigned").trim() || "Unassigned";
    const fee = Number(row.dispatch_fee) || 0;
    const status = String(row.status ?? "").toLowerCase();
    const inv = String(row.invoice ?? "").toLowerCase();
    miles += Number(row.miles) || 0;
    grossRevenue += Number(row.rc_invoice) || 0;
    commission += fee;
    if (status !== "paid" && !status.startsWith("paid") && inv !== "paid") {
      unpaidBalance += Math.max(0, Number(row.balance) || 0);
    }
    const entry = byMonthMap.get(m) ?? { loads: 0, commission: 0 };
    entry.loads += 1;
    entry.commission += fee;
    byMonthMap.set(m, entry);
  }

  const byMonth = Array.from(byMonthMap.entries())
    .map(([monthTab, v]) => ({
      monthTab,
      loads: v.loads,
      commission: Math.round(v.commission * 100) / 100,
    }))
    .sort((a, b) => a.monthTab.localeCompare(b.monthTab));

  let paidCount = 0;
  let partialCount = 0;
  let unpaidCount = 0;
  let billedTotal = 0;
  let receivedTotal = 0;

  for (const inv of sentInvoices) {
    billedTotal += inv.amountTotal;
    receivedTotal += inv.amountReceived;
    if (inv.paymentStatus === "paid") paidCount += 1;
    else if (inv.paymentStatus === "partial") partialCount += 1;
    else unpaidCount += 1;
  }

  const academy = {
    studentsTotal: students.length,
    paid: students.filter((s) => s.enrollmentStatus === "paid").length,
    pending: students.filter((s) => s.enrollmentStatus === "pending").length,
    unpaid: students.filter((s) => s.enrollmentStatus === "unpaid").length,
    refunded: students.filter((s) => s.enrollmentStatus === "refunded").length,
  };

  const aging = buildInvoiceAging(sentInvoices);

  return {
    generatedAt: new Date().toISOString(),
    loads: {
      total: loads.length,
      miles: Math.round(miles),
      grossRevenue: Math.round(grossRevenue * 100) / 100,
      commission: Math.round(commission * 100) / 100,
      unpaidBalance: Math.round(unpaidBalance * 100) / 100,
      byMonth,
    },
    invoices: {
      sentTotal: sentInvoices.length,
      paidCount,
      partialCount,
      unpaidCount,
      billedTotal: Math.round(billedTotal * 100) / 100,
      receivedTotal: Math.round(receivedTotal * 100) / 100,
      openBalance: Math.round((billedTotal - receivedTotal) * 100) / 100,
      aging,
    },
    academy,
    traffic: {
      pageViewsLast7Days,
      pageViewsLast30Days,
    },
  };
}
