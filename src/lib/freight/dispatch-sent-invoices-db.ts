import type { CarrierDispatchInvoice } from "./dispatch-invoice";
import type { DashboardLoad } from "./dispatch-dashboard-types";
import { sanitizeMoney, sanitizeText } from "./api-security";
import { computeBalance } from "./load-notifications";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type SentInvoiceLineItem = {
  sr: string;
  load_number?: string;
  loadNumber?: string;
  amount: number;
  db_id?: string | null;
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
  paymentStatus: "unpaid" | "partial" | "paid";
  paymentMethod: string;
  sentAt: string;
  lineItems: SentInvoiceLineItem[];
  notes: string;
};

export type BilledLoadKeys = {
  dbIds: Set<string>;
  loadNumbers: Set<string>;
  carrierSrs: Set<string>;
};

function rowToRecord(row: Record<string, unknown>): SentInvoiceRecord {
  return {
    id: String(row.id),
    invoiceNumber: String(row.invoice_number),
    monthTab: String(row.month_tab),
    carrierName: String(row.carrier_name),
    carrierEmail: String(row.carrier_email ?? ""),
    invoiceDate: String(row.invoice_date),
    dueDate: String(row.due_date),
    amountTotal: Number(row.amount_total) || 0,
    amountReceived: Number(row.amount_received) || 0,
    paymentStatus: row.payment_status as SentInvoiceRecord["paymentStatus"],
    paymentMethod: String(row.payment_method ?? ""),
    sentAt: String(row.sent_at),
    lineItems: Array.isArray(row.line_items)
      ? (row.line_items as SentInvoiceLineItem[])
      : [],
    notes: String(row.notes ?? ""),
  };
}

function parseInvoiceNumberDigits(value: string): number | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number.parseInt(digits, 10);
  return Number.isFinite(n) ? n : null;
}

async function resolveLoadDbId(
  item: SentInvoiceLineItem,
  ctx?: { monthTab?: string; carrierName?: string },
): Promise<string | null> {
  if (item.db_id) return item.db_id;

  const db = getServiceRoleClient();
  if (!db) return null;

  const loadNumber = item.load_number?.trim() ?? item.loadNumber?.trim();
  if (loadNumber) {
    let q = db
      .from("dispatch_loads")
      .select("id")
      .eq("load_number", loadNumber)
      .is("deleted_at", null)
      .limit(1);
    if (ctx?.monthTab) q = q.eq("month_tab", ctx.monthTab);
    if (ctx?.carrierName) q = q.ilike("company_name", ctx.carrierName);
    const { data } = await q.maybeSingle();
    if (data?.id) return data.id;
  }

  const srNum = Number.parseInt(String(item.sr ?? "").replace(/\D/g, ""), 10);
  if (Number.isFinite(srNum) && srNum > 0) {
    let q = db
      .from("dispatch_loads")
      .select("id")
      .eq("sr", srNum)
      .is("deleted_at", null)
      .limit(1);
    if (ctx?.monthTab) q = q.eq("month_tab", ctx.monthTab);
    if (ctx?.carrierName) q = q.ilike("company_name", ctx.carrierName);
    const { data } = await q.maybeSingle();
    if (data?.id) return data.id;
  }

  return null;
}

async function enrichLineItemsWithDbIds(
  items: SentInvoiceLineItem[],
  ctx?: { monthTab?: string; carrierName?: string },
): Promise<SentInvoiceLineItem[]> {
  const out: SentInvoiceLineItem[] = [];
  for (const item of items) {
    const db_id = (await resolveLoadDbId(item, ctx)) ?? item.db_id ?? null;
    out.push({ ...item, db_id });
  }
  return out;
}

async function markLoadsInvoiceSent(items: SentInvoiceLineItem[]): Promise<void> {
  const db = getServiceRoleClient();
  if (!db) return;

  for (const item of items) {
    const id = item.db_id ?? (await resolveLoadDbId(item));
    if (id) {
      await db.from("dispatch_loads").update({ invoice: "Sent" }).eq("id", id);
    }
  }
}

async function syncLoadsWithPaymentStatus(
  items: SentInvoiceLineItem[],
  paymentStatus: SentInvoiceRecord["paymentStatus"],
  amountReceived: number,
  ctx?: { monthTab?: string; carrierName?: string },
): Promise<void> {
  const db = getServiceRoleClient();
  if (!db) return;

  const enriched = await enrichLineItemsWithDbIds(items, ctx);
  if (!enriched.some((i) => i.db_id)) return;

  if (paymentStatus === "paid") {
    for (const item of enriched) {
      if (!item.db_id) continue;
      const { data: loadRow } = await db
        .from("dispatch_loads")
        .select("dispatch_fee, received")
        .eq("id", item.db_id)
        .maybeSingle();
      const fee = Number(loadRow?.dispatch_fee) || item.amount;
      const received = Math.max(Number(loadRow?.received) || 0, fee);
      await db
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
    const total = enriched.reduce((sum, i) => sum + i.amount, 0);
    if (total <= 0) return;

    for (const item of enriched) {
      if (!item.db_id) continue;
      const share = Math.round((item.amount / total) * amountReceived * 100) / 100;
      const { data: loadRow } = await db
        .from("dispatch_loads")
        .select("dispatch_fee, received")
        .eq("id", item.db_id)
        .maybeSingle();
      const fee = Number(loadRow?.dispatch_fee) || item.amount;
      const received = Math.min(fee, share);
      await db
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
    for (const item of enriched) {
      if (!item.db_id) continue;
      await db
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

export async function getNextInvoiceNumber(): Promise<number> {
  const db = getServiceRoleClient();
  if (!db) return 1;

  const { data, error } = await db
    .from("dispatch_sent_invoices")
    .select("invoice_number")
    .is("deleted_at", null);

  if (error) {
    console.error("[dispatch-sent-invoices-db] next number failed:", error);
    return 1;
  }

  let max = 0;
  for (const row of data ?? []) {
    const n = parseInvoiceNumberDigits(String(row.invoice_number ?? ""));
    if (n !== null && n > max) max = n;
  }
  return max + 1;
}

export async function listSentInvoices(monthTab?: string): Promise<SentInvoiceRecord[]> {
  const db = getServiceRoleClient();
  if (!db) return [];

  let q = db
    .from("dispatch_sent_invoices")
    .select("*")
    .is("deleted_at", null)
    .order("sent_at", { ascending: false });

  if (monthTab) q = q.eq("month_tab", monthTab);

  const { data, error } = await q;
  if (error) {
    console.error("[dispatch-sent-invoices-db] list failed:", error);
    return [];
  }

  return (data ?? []).map((row) => rowToRecord(row as Record<string, unknown>));
}

export async function listBilledLoadKeys(): Promise<BilledLoadKeys> {
  const dbIds = new Set<string>();
  const loadNumbers = new Set<string>();
  const carrierSrs = new Set<string>();

  for (const inv of await listSentInvoices()) {
    const carrier = inv.carrierName.trim().toLowerCase();
    for (const li of inv.lineItems) {
      if (li.db_id) dbIds.add(li.db_id);
      const ln = li.load_number?.trim() ?? li.loadNumber?.trim();
      if (ln) loadNumbers.add(ln);
      if (li.sr && carrier) carrierSrs.add(`${carrier}::${li.sr}`);
    }
  }

  return { dbIds, loadNumbers, carrierSrs };
}

export function isLoadBilledOnSentInvoice(
  load: DashboardLoad,
  billed: BilledLoadKeys,
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
  return Boolean(carrier && load.sr && billed.carrierSrs.has(`${carrier}::${load.sr}`));
}

export async function reconcileSentInvoicesWithLoads(): Promise<number> {
  const db = getServiceRoleClient();
  if (!db) return 0;

  let updated = 0;
  const invoices = await listSentInvoices();

  for (const inv of invoices) {
    const enriched = await enrichLineItemsWithDbIds(inv.lineItems, {
      monthTab: inv.monthTab,
      carrierName: inv.carrierName,
    });

    if (
      enriched.some((item, idx) => item.db_id && item.db_id !== inv.lineItems[idx]?.db_id)
    ) {
      await db
        .from("dispatch_sent_invoices")
        .update({ line_items: enriched })
        .eq("id", inv.id);
    }

    if (inv.paymentStatus === "paid" || inv.paymentStatus === "partial") {
      await syncLoadsWithPaymentStatus(
        enriched,
        inv.paymentStatus,
        inv.amountReceived,
        { monthTab: inv.monthTab, carrierName: inv.carrierName },
      );
      updated += enriched.filter((i) => i.db_id).length;
      continue;
    }

    for (const item of enriched) {
      if (!item.db_id) continue;
      const { data: loadRow } = await db
        .from("dispatch_loads")
        .select("invoice")
        .eq("id", item.db_id)
        .maybeSingle();
      const invoiceVal = String(loadRow?.invoice ?? "").trim().toLowerCase();
      if (invoiceVal && invoiceVal !== "pending" && invoiceVal !== "—" && invoiceVal !== "-") {
        continue;
      }
      await db.from("dispatch_loads").update({ invoice: "Sent" }).eq("id", item.db_id);
      updated += 1;
    }
  }

  return updated;
}

export async function recordSentInvoice(params: {
  invoice: CarrierDispatchInvoice;
  loads: DashboardLoad[];
  monthTab: string;
  paymentMethod?: string | null;
  sentBy: string;
}): Promise<{ record: SentInvoiceRecord | null; error?: string }> {
  const db = getServiceRoleClient();
  if (!db) {
    return {
      record: null,
      error:
        "Database unavailable (service role). Run supabase/dispatch-sent-invoices-schema.sql and set SUPABASE_SERVICE_ROLE_KEY.",
    };
  }

  const lineItems: SentInvoiceLineItem[] = params.invoice.lineItems.map((li) => {
    const load =
      params.loads.find((l) => l.sr === li.sr) ||
      params.loads.find(
        (l) =>
          li.loadNumber &&
          l.load_number !== "—" &&
          l.load_number === li.loadNumber,
      );
    return {
      sr: li.sr,
      load_number: li.loadNumber,
      loadNumber: li.loadNumber,
      amount: li.amount,
      db_id: load?.db_id ?? null,
    };
  });

  const invoiceDate = params.invoice.invoiceDate.toISOString().slice(0, 10);
  const dueDate = params.invoice.dueDate.toISOString().slice(0, 10);
  const invoiceNumber = sanitizeText(String(params.invoice.invoiceNumber), 40);

  const insertRow = {
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

  const { data: inserted, error } = await db
    .from("dispatch_sent_invoices")
    .insert(insertRow)
    .select("*")
    .single();

  if (error) {
    if (error.code === "23505" || /duplicate|unique/i.test(error.message ?? "")) {
      const suffix = `-${sanitizeText(params.invoice.carrierName, 20)
        .replace(/\s+/g, "")
        .slice(0, 8)}`;
      const altNumber = `${invoiceNumber}${suffix}`;
      const { data: retryInsert, error: retryErr } = await db
        .from("dispatch_sent_invoices")
        .insert({ ...insertRow, invoice_number: altNumber })
        .select("*")
        .single();

      if (!retryErr && retryInsert) {
        let enriched = await enrichLineItemsWithDbIds(lineItems, {
          monthTab: insertRow.month_tab,
          carrierName: insertRow.carrier_name,
        });
        await markLoadsInvoiceSent(enriched);
        return {
          record: rowToRecord({ ...retryInsert, line_items: enriched } as Record<string, unknown>),
        };
      }

      console.error("[dispatch-sent-invoices-db] duplicate invoice_number:", invoiceNumber);
      return {
        record: null,
        error: `Invoice #${invoiceNumber} already sent — use a different invoice number for ${params.invoice.carrierName}.`,
      };
    }

    console.error("[dispatch-sent-invoices-db] insert failed:", error);
    const msg =
      error.message?.includes("does not exist") || error.code === "42P01"
        ? "Sent invoices table missing — run supabase/dispatch-sent-invoices-schema.sql"
        : error.message || "Could not save sent invoice record";
    return { record: null, error: msg };
  }

  let enriched = await enrichLineItemsWithDbIds(lineItems, {
    monthTab: insertRow.month_tab,
    carrierName: insertRow.carrier_name,
  });

  if (enriched.some((item, idx) => item.db_id !== lineItems[idx]?.db_id)) {
    await db
      .from("dispatch_sent_invoices")
      .update({ line_items: enriched })
      .eq("id", inserted.id);
  }

  await markLoadsInvoiceSent(enriched);
  return {
    record: rowToRecord({ ...inserted, line_items: enriched } as Record<string, unknown>),
  };
}

export async function updateSentInvoice(params: {
  id: string;
  paymentStatus?: SentInvoiceRecord["paymentStatus"];
  amountReceived?: number;
  invoiceNumber?: string;
  notes?: string;
  syncLoads?: boolean;
}): Promise<SentInvoiceRecord | null> {
  const db = getServiceRoleClient();
  if (!db) return null;

  const { data: existing } = await db
    .from("dispatch_sent_invoices")
    .select("*")
    .eq("id", params.id)
    .is("deleted_at", null)
    .maybeSingle();

  if (!existing) return null;

  const patch: Record<string, unknown> = {};
  if (params.invoiceNumber !== undefined) {
    patch.invoice_number = sanitizeText(params.invoiceNumber, 40);
  }
  if (params.notes !== undefined) {
    patch.notes = params.notes ? sanitizeText(params.notes, 500) : null;
  }

  let paymentStatus = existing.payment_status as SentInvoiceRecord["paymentStatus"];
  let amountReceived = Number(existing.amount_received) || 0;
  const amountTotal = Number(existing.amount_total) || 0;

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

  const { data: updated, error } = await db
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
    const lineItems = (existing.line_items ?? []) as SentInvoiceLineItem[];
    const enriched = await enrichLineItemsWithDbIds(lineItems, {
      monthTab: String(existing.month_tab),
      carrierName: String(existing.carrier_name),
    });

    if (enriched.some((item, idx) => item.db_id !== lineItems[idx]?.db_id)) {
      await db
        .from("dispatch_sent_invoices")
        .update({ line_items: enriched })
        .eq("id", params.id);
    }

    await syncLoadsWithPaymentStatus(
      enriched,
      paymentStatus,
      amountReceived,
      {
        monthTab: String(existing.month_tab),
        carrierName: String(existing.carrier_name),
      },
    );
  }

  return rowToRecord(updated as Record<string, unknown>);
}

export async function softDeleteSentInvoice(id: string): Promise<boolean> {
  const db = getServiceRoleClient();
  if (!db) return false;

  const { error } = await db
    .from("dispatch_sent_invoices")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  return !error;
}
