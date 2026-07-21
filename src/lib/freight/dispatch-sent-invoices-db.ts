import type { CarrierDispatchInvoice } from "./dispatch-invoice";
import type { DashboardLoad } from "./dispatch-dashboard-types";
import type { InvoicePaymentMethod } from "./dispatch-invoice-payment";
import { computeBalance } from "./load-notifications";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeMoney, sanitizeText } from "./api-security";

export type SentInvoicePaymentStatus = "unpaid" | "partial" | "paid";

export type SentInvoiceLineItem = {
  sr: string;
  load_number: string;
  amount: number;
  db_id: string | null;
};

export type DbSentInvoice = {
  id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  invoice_number: string;
  month_tab: string;
  carrier_name: string;
  carrier_email: string | null;
  invoice_date: string;
  due_date: string;
  amount_total: number;
  amount_received: number;
  payment_status: SentInvoicePaymentStatus;
  payment_method: string | null;
  sent_at: string;
  sent_by: string | null;
  line_items: SentInvoiceLineItem[];
  notes: string | null;
};

export type SentInvoiceRecord = {
  id: string;
  invoiceNumber: string;
  monthTab: string;
  carrierName: string;
  carrierEmail: string;
  invoiceDate: string;
  dueDate: string;
  amountTotal: number;
  amountReceived: number;
  paymentStatus: SentInvoicePaymentStatus;
  paymentMethod: string;
  sentAt: string;
  lineItems: SentInvoiceLineItem[];
  notes: string;
};

function rowToRecord(row: DbSentInvoice): SentInvoiceRecord {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    monthTab: row.month_tab,
    carrierName: row.carrier_name,
    carrierEmail: row.carrier_email ?? "",
    invoiceDate: row.invoice_date,
    dueDate: row.due_date,
    amountTotal: Number(row.amount_total) || 0,
    amountReceived: Number(row.amount_received) || 0,
    paymentStatus: row.payment_status,
    paymentMethod: row.payment_method ?? "",
    sentAt: row.sent_at,
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    notes: row.notes ?? "",
  };
}

function parseNumericInvoiceNumber(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

export async function getNextInvoiceNumber(): Promise<number> {
  const admin = getServiceRoleClient();
  if (!admin) return 1;

  const { data, error } = await admin
    .from("dispatch_sent_invoices")
    .select("invoice_number")
    .is("deleted_at", null);

  if (error) {
    console.error("[dispatch-sent-invoices-db] next number failed:", error);
    return 1;
  }

  let max = 0;
  for (const row of data ?? []) {
    const n = parseNumericInvoiceNumber(String(row.invoice_number ?? ""));
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

export function buildSentInvoiceLineItems(
  invoice: CarrierDispatchInvoice,
  loads: DashboardLoad[],
): SentInvoiceLineItem[] {
  return invoice.lineItems.map((li) => {
    const load =
      loads.find((l) => l.sr === li.sr) ||
      loads.find(
        (l) =>
          li.loadNumber &&
          l.load_number !== "—" &&
          l.load_number === li.loadNumber,
      );
    return {
      sr: li.sr,
      load_number: li.loadNumber,
      amount: li.amount,
      db_id: load?.db_id ?? null,
    };
  });
}

/** Resolve dispatch_loads.id when line item was saved without db_id (older sends). */
async function resolveLoadDbId(
  item: SentInvoiceLineItem,
  opts?: { monthTab?: string; carrierName?: string },
): Promise<string | null> {
  if (item.db_id) return item.db_id;
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const loadNumber = item.load_number?.trim();
  if (loadNumber) {
    let q = admin
      .from("dispatch_loads")
      .select("id")
      .eq("load_number", loadNumber)
      .is("deleted_at", null)
      .limit(1);
    if (opts?.monthTab) q = q.eq("month_tab", opts.monthTab);
    if (opts?.carrierName) q = q.ilike("company_name", opts.carrierName);
    const { data } = await q.maybeSingle();
    if (data?.id) return data.id as string;
  }

  const sr = Number.parseInt(String(item.sr ?? "").replace(/\D/g, ""), 10);
  if (Number.isFinite(sr) && sr > 0) {
    let q = admin
      .from("dispatch_loads")
      .select("id")
      .eq("sr", sr)
      .is("deleted_at", null)
      .limit(1);
    if (opts?.monthTab) q = q.eq("month_tab", opts.monthTab);
    if (opts?.carrierName) q = q.ilike("company_name", opts.carrierName);
    const { data } = await q.maybeSingle();
    if (data?.id) return data.id as string;
  }

  return null;
}

async function withResolvedLineItems(
  lineItems: SentInvoiceLineItem[],
  opts?: { monthTab?: string; carrierName?: string },
): Promise<SentInvoiceLineItem[]> {
  const out: SentInvoiceLineItem[] = [];
  for (const item of lineItems) {
    const db_id = (await resolveLoadDbId(item, opts)) ?? item.db_id;
    out.push({ ...item, db_id });
  }
  return out;
}

/** Keys for loads already on a Sent invoice — must not appear on Create again. */
export async function listBilledLoadKeys(): Promise<{
  dbIds: Set<string>;
  loadNumbers: Set<string>;
  carrierSrs: Set<string>;
}> {
  const dbIds = new Set<string>();
  const loadNumbers = new Set<string>();
  const carrierSrs = new Set<string>();
  const invoices = await listSentInvoices();
  for (const inv of invoices) {
    const carrier = inv.carrierName.trim().toLowerCase();
    for (const li of inv.lineItems) {
      if (li.db_id) dbIds.add(li.db_id);
      if (li.load_number) loadNumbers.add(li.load_number.trim());
      if (li.sr && carrier) carrierSrs.add(`${carrier}::${li.sr}`);
    }
  }
  return { dbIds, loadNumbers, carrierSrs };
}

export function isLoadBilledOnSentInvoice(
  load: DashboardLoad,
  billed: {
    dbIds: Set<string>;
    loadNumbers: Set<string>;
    carrierSrs: Set<string>;
  },
): boolean {
  if (load.db_id && billed.dbIds.has(load.db_id)) return true;
  if (
    load.load_number &&
    load.load_number !== "—" &&
    billed.loadNumbers.has(load.load_number.trim())
  ) {
    return true;
  }
  const carrier = load.carrier.trim().toLowerCase();
  if (carrier && load.sr && billed.carrierSrs.has(`${carrier}::${load.sr}`)) {
    return true;
  }
  return false;
}

/**
 * Re-apply Sent / Paid / Partial from sent invoices onto load rows
 * (fixes older rows stuck on Invoice = Pending after mark-paid).
 */
export async function reconcileSentInvoicesWithLoads(): Promise<number> {
  const admin = getServiceRoleClient();
  if (!admin) return 0;

  const invoices = await listSentInvoices();
  let updated = 0;
  for (const inv of invoices) {
    const resolved = await withResolvedLineItems(inv.lineItems, {
      monthTab: inv.monthTab,
      carrierName: inv.carrierName,
    });
    const needsPersist = resolved.some(
      (li, i) => li.db_id && li.db_id !== inv.lineItems[i]?.db_id,
    );
    if (needsPersist) {
      await admin
        .from("dispatch_sent_invoices")
        .update({ line_items: resolved })
        .eq("id", inv.id);
    }

    if (inv.paymentStatus === "paid" || inv.paymentStatus === "partial") {
      await syncLoadsForPayment(resolved, inv.paymentStatus, inv.amountReceived, {
        monthTab: inv.monthTab,
        carrierName: inv.carrierName,
      });
      updated += resolved.filter((li) => li.db_id).length;
      continue;
    }

    // Unpaid sent invoice: only flip workflow column Pending → Sent (do not wipe payments).
    for (const item of resolved) {
      if (!item.db_id) continue;
      const { data: existing } = await admin
        .from("dispatch_loads")
        .select("invoice")
        .eq("id", item.db_id)
        .maybeSingle();
      const current = String(existing?.invoice ?? "")
        .trim()
        .toLowerCase();
      if (!current || current === "pending" || current === "—" || current === "-") {
        await admin
          .from("dispatch_loads")
          .update({ invoice: "Sent" })
          .eq("id", item.db_id);
        updated += 1;
      }
    }
  }
  return updated;
}

export async function recordSentInvoice(params: {
  invoice: CarrierDispatchInvoice;
  loads: DashboardLoad[];
  monthTab: string;
  paymentMethod?: InvoicePaymentMethod;
  sentBy: string;
}): Promise<{ record: SentInvoiceRecord | null; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) {
    return {
      record: null,
      error:
        "Database unavailable (service role). Run supabase/dispatch-sent-invoices-schema.sql and set SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const lineItems = buildSentInvoiceLineItems(params.invoice, params.loads);
  const invoiceDate = params.invoice.invoiceDate.toISOString().slice(0, 10);
  const dueDate = params.invoice.dueDate.toISOString().slice(0, 10);
  const invoiceNumber = sanitizeText(String(params.invoice.invoiceNumber), 40);

  const payload = {
    invoice_number: invoiceNumber,
    month_tab: sanitizeText(params.monthTab, 40),
    carrier_name: sanitizeText(params.invoice.carrierName, 200),
    carrier_email: params.invoice.billTo.email
      ? sanitizeText(params.invoice.billTo.email, 200)
      : null,
    invoice_date: invoiceDate,
    due_date: dueDate,
    amount_total: sanitizeMoney(params.invoice.total),
    amount_received: 0,
    payment_status: "unpaid" as const,
    payment_method: params.paymentMethod ?? null,
    sent_by: params.sentBy,
    sent_at: new Date().toISOString(),
    line_items: lineItems,
    deleted_at: null,
  };

  const { data, error } = await admin
    .from("dispatch_sent_invoices")
    .insert(payload)
    .select("*")
    .single();

  if (error) {
    // Duplicate invoice number: revive/update the existing active row for this number.
    const isDuplicate =
      error.code === "23505" ||
      /duplicate|unique/i.test(error.message ?? "");

    if (isDuplicate) {
      const { data: existing } = await admin
        .from("dispatch_sent_invoices")
        .select("id")
        .ilike("invoice_number", invoiceNumber)
        .is("deleted_at", null)
        .maybeSingle();

      if (existing?.id) {
        const { data: updated, error: upErr } = await admin
          .from("dispatch_sent_invoices")
          .update({
            month_tab: payload.month_tab,
            carrier_name: payload.carrier_name,
            carrier_email: payload.carrier_email,
            invoice_date: payload.invoice_date,
            due_date: payload.due_date,
            amount_total: payload.amount_total,
            amount_received: 0,
            payment_status: "unpaid",
            payment_method: payload.payment_method,
            sent_by: payload.sent_by,
            sent_at: payload.sent_at,
            line_items: payload.line_items,
          })
          .eq("id", existing.id)
          .select("*")
          .single();

        if (!upErr && updated) {
          const resolved = await withResolvedLineItems(lineItems, {
            monthTab: payload.month_tab,
            carrierName: payload.carrier_name,
          });
          await markLoadsInvoiced(resolved);
          return { record: rowToRecord(updated as DbSentInvoice) };
        }
      }
    }

    console.error("[dispatch-sent-invoices-db] insert failed:", error);
    return {
      record: null,
      error:
        error.message?.includes("does not exist") || error.code === "42P01"
          ? "Sent invoices table missing — run supabase/dispatch-sent-invoices-schema.sql"
          : error.message || "Could not save sent invoice record",
    };
  }

  const resolved = await withResolvedLineItems(lineItems, {
    monthTab: payload.month_tab,
    carrierName: payload.carrier_name,
  });
  if (resolved.some((li, i) => li.db_id !== lineItems[i]?.db_id)) {
    await admin
      .from("dispatch_sent_invoices")
      .update({ line_items: resolved })
      .eq("id", (data as DbSentInvoice).id);
  }
  await markLoadsInvoiced(resolved);
  return {
    record: rowToRecord({ ...(data as DbSentInvoice), line_items: resolved }),
  };
}

async function markLoadsInvoiced(lineItems: SentInvoiceLineItem[]): Promise<void> {
  const admin = getServiceRoleClient();
  if (!admin) return;
  for (const item of lineItems) {
    const id = item.db_id ?? (await resolveLoadDbId(item));
    if (!id) continue;
    await admin.from("dispatch_loads").update({ invoice: "Sent" }).eq("id", id);
  }
}

export async function listSentInvoices(monthTab?: string): Promise<SentInvoiceRecord[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  let query = admin
    .from("dispatch_sent_invoices")
    .select("*")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false });

  if (monthTab) {
    query = query.eq("month_tab", monthTab);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[dispatch-sent-invoices-db] list failed:", error);
    return [];
  }

  return (data as DbSentInvoice[]).map(rowToRecord);
}

async function syncLoadsForPayment(
  lineItems: SentInvoiceLineItem[],
  paymentStatus: SentInvoicePaymentStatus,
  amountReceived: number,
  opts?: { monthTab?: string; carrierName?: string },
): Promise<void> {
  const admin = getServiceRoleClient();
  if (!admin) return;

  const resolved = await withResolvedLineItems(lineItems, opts);
  if (!resolved.some((li) => li.db_id)) return;

  if (paymentStatus === "paid") {
    for (const item of resolved) {
      if (!item.db_id) continue;
      const { data: existing } = await admin
        .from("dispatch_loads")
        .select("dispatch_fee, received")
        .eq("id", item.db_id)
        .maybeSingle();
      const fee = Number(existing?.dispatch_fee) || item.amount;
      const received = Math.max(Number(existing?.received) || 0, fee);
      await admin
        .from("dispatch_loads")
        .update({
          status: "Paid",
          invoice: "Paid",
          received,
          balance: 0,
        })
        .eq("id", item.db_id);
    }
    return;
  }

  if (paymentStatus === "partial" && amountReceived > 0) {
    const total = resolved.reduce((s, li) => s + li.amount, 0);
    if (total <= 0) return;

    for (const item of resolved) {
      if (!item.db_id) continue;
      const share = Math.round((item.amount / total) * amountReceived * 100) / 100;
      const { data: existing } = await admin
        .from("dispatch_loads")
        .select("dispatch_fee, received")
        .eq("id", item.db_id)
        .maybeSingle();
      const fee = Number(existing?.dispatch_fee) || item.amount;
      const received = Math.min(fee, share);
      await admin
        .from("dispatch_loads")
        .update({
          status: "Partial",
          invoice: "Partial",
          received,
          balance: computeBalance(fee, received),
        })
        .eq("id", item.db_id);
    }
    return;
  }

  if (paymentStatus === "unpaid") {
    for (const item of resolved) {
      if (!item.db_id) continue;
      await admin
        .from("dispatch_loads")
        .update({
          status: "Unpaid",
          invoice: "Sent",
          received: 0,
          balance: item.amount,
        })
        .eq("id", item.db_id);
    }
  }
}

export async function updateSentInvoice(params: {
  id: string;
  paymentStatus?: SentInvoicePaymentStatus;
  amountReceived?: number;
  invoiceNumber?: string;
  notes?: string;
  syncLoads?: boolean;
}): Promise<SentInvoiceRecord | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data: existing } = await admin
    .from("dispatch_sent_invoices")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return null;

  const row = existing as DbSentInvoice;
  const patch: Record<string, unknown> = {};

  if (params.invoiceNumber !== undefined) {
    patch.invoice_number = sanitizeText(params.invoiceNumber, 40);
  }
  if (params.notes !== undefined) {
    patch.notes = params.notes ? sanitizeText(params.notes, 500) : null;
  }

  let paymentStatus = row.payment_status as SentInvoicePaymentStatus;
  let amountReceived = Number(row.amount_received) || 0;
  const amountTotal = Number(row.amount_total) || 0;

  if (params.paymentStatus !== undefined) {
    paymentStatus = params.paymentStatus;
    patch.payment_status = paymentStatus;

    if (paymentStatus === "paid") {
      amountReceived = amountTotal;
      patch.amount_received = amountReceived;
    } else if (paymentStatus === "unpaid") {
      amountReceived = 0;
      patch.amount_received = 0;
    }
  }

  if (params.amountReceived !== undefined) {
    amountReceived = sanitizeMoney(params.amountReceived);
    patch.amount_received = amountReceived;
    if (amountReceived <= 0) {
      paymentStatus = "unpaid";
      patch.payment_status = "unpaid";
    } else if (amountReceived >= amountTotal) {
      paymentStatus = "paid";
      patch.payment_status = "paid";
      patch.amount_received = amountTotal;
      amountReceived = amountTotal;
    } else {
      paymentStatus = "partial";
      patch.payment_status = "partial";
    }
  }

  const { data, error } = await admin
    .from("dispatch_sent_invoices")
    .update(patch)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error("[dispatch-sent-invoices-db] update failed:", error);
    return null;
  }

  if (params.syncLoads !== false) {
    const lineItems = (row.line_items as SentInvoiceLineItem[]) ?? [];
    const resolved = await withResolvedLineItems(lineItems, {
      monthTab: row.month_tab,
      carrierName: row.carrier_name,
    });
    if (resolved.some((li, i) => li.db_id !== lineItems[i]?.db_id)) {
      await admin
        .from("dispatch_sent_invoices")
        .update({ line_items: resolved })
        .eq("id", params.id);
    }
    await syncLoadsForPayment(resolved, paymentStatus, amountReceived, {
      monthTab: row.month_tab,
      carrierName: row.carrier_name,
    });
  }

  return rowToRecord(data as DbSentInvoice);
}

export async function softDeleteSentInvoice(id: string): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) return false;

  const { error } = await admin
    .from("dispatch_sent_invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  return !error;
}
