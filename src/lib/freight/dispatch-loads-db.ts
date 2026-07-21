import type { DashboardLoad, DispatchSheetRow } from "./dispatch-dashboard-types";
import { splitRoute } from "./dispatch-sheet";
import { monthTabFromRcDate } from "./dispatch-sheet-tabs";
import { computeBalance, computeDispatchFee } from "./load-notifications";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeMoney, sanitizeText } from "./api-security";

export type DbDispatchLoad = {
  id: string;
  month_tab: string;
  sr: number;
  booked_by: string | null;
  rc_date: string | null;
  truck_trailer: string | null;
  company_name: string;
  broker: string | null;
  load_details: string | null;
  pickup_date_time: string | null;
  delivery_date_time: string | null;
  miles: number;
  load_number: string | null;
  states: string | null;
  rc_invoice: number;
  dispatch_percent: number;
  dispatch_fee: number;
  invoice: string | null;
  received: number;
  balance: number;
  notes: string | null;
  claim: string | null;
  status: string;
  cpay: string | null;
  dtp: string | null;
  broker_agent_name: string | null;
  email: string | null;
  phone: string | null;
  carrier_profile_id: string | null;
  assigned_driver_profile_id: string | null;
  rate_con_path: string | null;
  bol_path: string | null;
  commodity_path: string | null;
  pod_path: string | null;
  deleted_at: string | null;
};

export type LoadInsertPayload = {
  monthTab: string;
  companyName: string;
  broker?: string;
  loadDetails?: string;
  pickupDateTime?: string;
  deliveryDateTime?: string;
  miles?: number;
  loadNumber?: string;
  states?: string;
  rcInvoice?: number;
  dispatchPercent?: number;
  dispatchFee?: number;
  status?: string;
  bookedBy?: string;
  truckTrailer?: string;
  email?: string;
  phone?: string;
  carrierProfileId?: string;
  assignedDriverProfileId?: string | null;
  rcDate?: string;
  invoice?: string;
  received?: number;
  balance?: number;
  notes?: string;
  claim?: string;
  cpay?: string;
  dtp?: string;
  brokerAgentName?: string;
};

export function dbDispatchLoadToSheetRow(row: DbDispatchLoad): DispatchSheetRow {
  return {
    sr: String(row.sr),
    bookedBy: row.booked_by ?? "",
    rcDate: row.rc_date ?? "",
    truckTrailer: row.truck_trailer ?? "",
    companyName: row.company_name,
    broker: row.broker ?? "",
    loadDetails: row.load_details ?? "",
    pickupDateTime: row.pickup_date_time ?? "",
    deliveryDateTime: row.delivery_date_time ?? "",
    miles: Number(row.miles) || 0,
    loadNumber: row.load_number ?? "",
    states: row.states ?? "",
    rcInvoice: Number(row.rc_invoice) || 0,
    dispatchPercent: Number(row.dispatch_percent) || 0,
    dispatchFee: Number(row.dispatch_fee) || 0,
    invoice: row.invoice ?? "",
    received: Number(row.received) || 0,
    balance: Number(row.balance) || 0,
    notes: row.notes ?? "",
    claim: row.claim ?? "",
    status: row.status ?? "",
    cpay: row.cpay ?? "",
    dtp: row.dtp ?? "",
    brokerAgentName: row.broker_agent_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    extraNotes: "",
  };
}

export function dbLoadToDashboardLoad(row: DbDispatchLoad, index: number): DashboardLoad {
  const sheet = dbDispatchLoadToSheetRow(row);
  const { origin, destination } = splitRoute(sheet.loadDetails, sheet.states);
  return {
    load_id: sheet.loadNumber || `LD-${sheet.sr || index + 1}`,
    sr: sheet.sr || String(index + 1),
    booked_by: sheet.bookedBy || "—",
    rc_date: sheet.rcDate || "—",
    truck_trailer: sheet.truckTrailer || "—",
    carrier: sheet.companyName || "—",
    broker: sheet.broker || "—",
    load_details: sheet.loadDetails || "—",
    origin,
    destination,
    pickup: sheet.pickupDateTime || "—",
    delivery: sheet.deliveryDateTime || "—",
    miles: sheet.miles,
    load_number: sheet.loadNumber || "—",
    states: sheet.states || "—",
    rate: sheet.rcInvoice,
    dispatch_percent: sheet.dispatchPercent,
    dispatch_fee: sheet.dispatchFee,
    invoice_status: sheet.invoice || "—",
    received: sheet.received,
    balance: sheet.balance,
    notes: sheet.notes || "—",
    claim: sheet.claim || "—",
    status: sheet.status || "Unpaid",
    cpay: sheet.cpay || "—",
    dtp: sheet.dtp || "—",
    broker_agent: sheet.brokerAgentName || "—",
    email: sheet.email || "—",
    phone: sheet.phone || "—",
    db_id: row.id,
    data_source: "supabase",
  };
}

export async function fetchDispatchLoadsFromDb(
  monthTab: string,
): Promise<DbDispatchLoad[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("dispatch_loads")
    .select("*")
    .eq("month_tab", monthTab)
    .is("deleted_at", null)
    .order("sr", { ascending: true });

  if (error) {
    console.warn("[dispatch-loads-db] fetch failed:", error.message);
    return [];
  }

  return (data ?? []) as DbDispatchLoad[];
}

/** Distinct month tabs that actually have loads — merge into picker options. */
export async function listDispatchMonthTabsFromDb(): Promise<string[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("dispatch_loads")
    .select("month_tab, rc_date")
    .is("deleted_at", null);

  if (error) {
    console.warn("[dispatch-loads-db] month tabs failed:", error.message);
    return [];
  }

  const tabs = new Set<string>();
  for (const row of data ?? []) {
    const fromRc = monthTabFromRcDate(String(row.rc_date ?? ""));
    if (fromRc) tabs.add(fromRc);
    const tab = String(row.month_tab ?? "").trim();
    if (tab) tabs.add(tab);
  }
  return Array.from(tabs);
}

/**
 * Move each load into the month of its RC Date (mm/dd/yyyy).
 * Fixes loads saved under the wrong picker month (e.g. July RC stuck in June).
 */
export async function reassignMonthTabsFromRcDates(): Promise<number> {
  const admin = getServiceRoleClient();
  if (!admin) return 0;

  const { data, error } = await admin
    .from("dispatch_loads")
    .select("id, month_tab, rc_date, sr")
    .is("deleted_at", null);

  if (error || !data?.length) {
    if (error) console.warn("[dispatch-loads-db] reassign fetch failed:", error.message);
    return 0;
  }

  let moved = 0;
  for (const row of data) {
    const target = monthTabFromRcDate(String(row.rc_date ?? ""));
    if (!target) continue;
    const current = String(row.month_tab ?? "").trim();
    if (current === target) continue;

    let sr = typeof row.sr === "number" ? row.sr : Number(row.sr) || 0;
    // Avoid (month_tab, sr) collisions when moving into a month that already has that SR.
    const { data: clash } = await admin
      .from("dispatch_loads")
      .select("id")
      .eq("month_tab", target)
      .eq("sr", sr)
      .is("deleted_at", null)
      .neq("id", row.id)
      .maybeSingle();
    if (clash?.id) {
      sr = await nextSrForTab(target);
    }

    const { error: upErr } = await admin
      .from("dispatch_loads")
      .update({ month_tab: target, sr })
      .eq("id", row.id);

    if (!upErr) moved += 1;
    else console.warn("[dispatch-loads-db] reassign failed:", upErr.message);
  }
  return moved;
}

export async function fetchCarrierLoadsFromDb(opts: {
  companyName: string;
  carrierProfileId?: string;
}): Promise<DbDispatchLoad[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  let query = admin
    .from("dispatch_loads")
    .select("*")
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  if (opts.carrierProfileId) {
    query = query.or(
      `carrier_profile_id.eq.${opts.carrierProfileId},company_name.ilike.${opts.companyName}`,
    );
  } else {
    query = query.ilike("company_name", opts.companyName);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[dispatch-loads-db] carrier fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as DbDispatchLoad[];
}

export async function fetchDriverLoadsFromDb(
  driverProfileId: string,
): Promise<DbDispatchLoad[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("dispatch_loads")
    .select("*")
    .eq("assigned_driver_profile_id", driverProfileId)
    .is("deleted_at", null)
    .order("pickup_date_time", { ascending: false });

  if (error) {
    console.warn("[dispatch-loads-db] driver fetch failed:", error.message);
    return [];
  }
  return (data ?? []) as DbDispatchLoad[];
}

async function nextSrForTab(monthTab: string): Promise<number> {
  const admin = getServiceRoleClient();
  if (!admin) return 1;

  const { data } = await admin
    .from("dispatch_loads")
    .select("sr")
    .eq("month_tab", monthTab)
    .is("deleted_at", null)
    .order("sr", { ascending: false })
    .limit(1);

  const max = data?.[0]?.sr;
  return (typeof max === "number" ? max : 0) + 1;
}

export async function insertDispatchLoad(
  payload: LoadInsertPayload,
  createdBy: string,
): Promise<{ id: string; sr: number } | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const rcInvoice = sanitizeMoney(payload.rcInvoice ?? 0);
  const dispatchPercent = sanitizeMoney(payload.dispatchPercent ?? 5);
  const fee = computeDispatchFee(rcInvoice, dispatchPercent, payload.dispatchFee);
  const received = sanitizeMoney(payload.received ?? 0);
  const balance = payload.balance != null ? sanitizeMoney(payload.balance) : computeBalance(fee, received);
  const rcDate = payload.rcDate
    ? sanitizeText(payload.rcDate, 40)
    : new Date().toLocaleDateString("en-US");
  // RC Date (mm/dd/yyyy) owns the month tab — not the UI picker alone.
  const monthTab =
    monthTabFromRcDate(rcDate) ||
    sanitizeText(payload.monthTab, 40) ||
    "Unassigned";
  const sr = await nextSrForTab(monthTab);

  const { data, error } = await admin
    .from("dispatch_loads")
    .insert({
      created_by: createdBy,
      month_tab: monthTab,
      sr,
      company_name: sanitizeText(payload.companyName, 200),
      broker: payload.broker ? sanitizeText(payload.broker, 200) : null,
      load_details: payload.loadDetails ? sanitizeText(payload.loadDetails, 500) : null,
      pickup_date_time: payload.pickupDateTime
        ? sanitizeText(payload.pickupDateTime, 120)
        : null,
      delivery_date_time: payload.deliveryDateTime
        ? sanitizeText(payload.deliveryDateTime, 120)
        : null,
      miles: sanitizeMoney(payload.miles ?? 0),
      load_number: payload.loadNumber ? sanitizeText(payload.loadNumber, 80) : null,
      states: payload.states ? sanitizeText(payload.states, 80) : null,
      rc_invoice: rcInvoice,
      dispatch_percent: dispatchPercent,
      dispatch_fee: fee,
      status: payload.status ? sanitizeText(payload.status, 40) : "Unpaid",
      balance,
      received,
      booked_by: payload.bookedBy ? sanitizeText(payload.bookedBy, 120) : null,
      truck_trailer: payload.truckTrailer ? sanitizeText(payload.truckTrailer, 120) : null,
      email: payload.email ? sanitizeText(payload.email, 200) : null,
      phone: payload.phone ? sanitizeText(payload.phone, 40) : null,
      carrier_profile_id: payload.carrierProfileId ?? null,
      assigned_driver_profile_id: payload.assignedDriverProfileId ?? null,
      rc_date: rcDate,
      invoice: payload.invoice ? sanitizeText(payload.invoice, 40) : "Pending",
      notes: payload.notes ? sanitizeText(payload.notes, 500) : null,
      claim: payload.claim ? sanitizeText(payload.claim, 200) : null,
      cpay: payload.cpay ? sanitizeText(payload.cpay, 80) : null,
      dtp: payload.dtp ? sanitizeText(payload.dtp, 80) : null,
      broker_agent_name: payload.brokerAgentName
        ? sanitizeText(payload.brokerAgentName, 120)
        : null,
    })
    .select("id,sr")
    .single();

  if (error) {
    console.error("[dispatch-loads-db] insert failed:", error);
    return null;
  }
  return { id: data.id as string, sr: data.sr as number };
}

export async function softDeleteDispatchLoad(id: string): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) return false;

  const { error } = await admin
    .from("dispatch_loads")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", id)
    .is("deleted_at", null);

  return !error;
}

export async function updateDispatchLoad(
  id: string,
  patch: Partial<LoadInsertPayload & { status: string; received: number; balance: number }>,
): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) return false;

  const { data: existing } = await admin
    .from("dispatch_loads")
    .select("rc_invoice, dispatch_percent, dispatch_fee, received, month_tab, rc_date, sr")
    .eq("id", id)
    .maybeSingle();

  const row: Record<string, unknown> = {};
  if (patch.companyName !== undefined) row.company_name = sanitizeText(patch.companyName, 200);
  if (patch.broker !== undefined) row.broker = sanitizeText(patch.broker, 200);
  if (patch.loadDetails !== undefined) row.load_details = sanitizeText(patch.loadDetails, 500);
  if (patch.pickupDateTime !== undefined) {
    row.pickup_date_time = sanitizeText(patch.pickupDateTime, 120);
  }
  if (patch.deliveryDateTime !== undefined) {
    row.delivery_date_time = sanitizeText(patch.deliveryDateTime, 120);
  }
  if (patch.miles !== undefined) row.miles = sanitizeMoney(patch.miles);
  if (patch.loadNumber !== undefined) row.load_number = sanitizeText(patch.loadNumber, 80);
  if (patch.states !== undefined) row.states = sanitizeText(patch.states, 80);
  if (patch.rcInvoice !== undefined) row.rc_invoice = sanitizeMoney(patch.rcInvoice);
  if (patch.dispatchPercent !== undefined) {
    row.dispatch_percent = sanitizeMoney(patch.dispatchPercent);
  }
  if (patch.dispatchFee !== undefined) row.dispatch_fee = sanitizeMoney(patch.dispatchFee);
  if (patch.status !== undefined) row.status = sanitizeText(patch.status, 40);
  if (patch.received !== undefined) row.received = sanitizeMoney(patch.received);
  if (patch.balance !== undefined) row.balance = sanitizeMoney(patch.balance);
  if (patch.bookedBy !== undefined) row.booked_by = sanitizeText(patch.bookedBy, 120);
  if (patch.truckTrailer !== undefined) {
    row.truck_trailer = sanitizeText(patch.truckTrailer, 120);
  }
  if (patch.email !== undefined) row.email = patch.email ? sanitizeText(patch.email, 200) : null;
  if (patch.phone !== undefined) row.phone = patch.phone ? sanitizeText(patch.phone, 40) : null;
  if (patch.rcDate !== undefined) {
    const rcDate = sanitizeText(patch.rcDate, 40);
    row.rc_date = rcDate;
    const targetMonth = monthTabFromRcDate(rcDate);
    const currentMonth = String(existing?.month_tab ?? "").trim();
    if (targetMonth && targetMonth !== currentMonth) {
      row.month_tab = targetMonth;
      let sr = typeof existing?.sr === "number" ? existing.sr : Number(existing?.sr) || 0;
      const { data: clash } = await admin
        .from("dispatch_loads")
        .select("id")
        .eq("month_tab", targetMonth)
        .eq("sr", sr)
        .is("deleted_at", null)
        .neq("id", id)
        .maybeSingle();
      if (clash?.id) {
        sr = await nextSrForTab(targetMonth);
        row.sr = sr;
      }
    }
  } else if (patch.monthTab !== undefined) {
    // Prefer RC Date month when available; otherwise allow explicit tab.
    const fromRc = monthTabFromRcDate(String(existing?.rc_date ?? ""));
    row.month_tab = fromRc || sanitizeText(patch.monthTab, 40);
  }
  if (patch.invoice !== undefined) row.invoice = sanitizeText(patch.invoice, 40);
  if (patch.notes !== undefined) row.notes = patch.notes ? sanitizeText(patch.notes, 500) : null;
  if (patch.claim !== undefined) row.claim = patch.claim ? sanitizeText(patch.claim, 200) : null;
  if (patch.cpay !== undefined) row.cpay = patch.cpay ? sanitizeText(patch.cpay, 80) : null;
  if (patch.dtp !== undefined) row.dtp = patch.dtp ? sanitizeText(patch.dtp, 80) : null;
  if (patch.brokerAgentName !== undefined) {
    row.broker_agent_name = patch.brokerAgentName
      ? sanitizeText(patch.brokerAgentName, 120)
      : null;
  }
  if (patch.assignedDriverProfileId !== undefined) {
    row.assigned_driver_profile_id = patch.assignedDriverProfileId || null;
  }

  const rcInvoice =
    patch.rcInvoice !== undefined
      ? sanitizeMoney(patch.rcInvoice)
      : Number(existing?.rc_invoice) || 0;
  const dispatchPercent =
    patch.dispatchPercent !== undefined
      ? sanitizeMoney(patch.dispatchPercent)
      : Number(existing?.dispatch_percent) || 0;
  const received =
    patch.received !== undefined
      ? sanitizeMoney(patch.received)
      : Number(existing?.received) || 0;

  if (
    patch.rcInvoice !== undefined ||
    patch.dispatchPercent !== undefined ||
    patch.dispatchFee !== undefined
  ) {
    const fee = computeDispatchFee(
      rcInvoice,
      dispatchPercent,
      patch.dispatchFee !== undefined ? patch.dispatchFee : Number(existing?.dispatch_fee) || 0,
    );
    row.dispatch_fee = fee;
    if (patch.balance === undefined) {
      row.balance = computeBalance(fee, received);
    }
  } else if (patch.received !== undefined && patch.balance === undefined) {
    const fee = Number(existing?.dispatch_fee) || 0;
    row.balance = computeBalance(fee, received);
  }

  const { error } = await admin.from("dispatch_loads").update(row).eq("id", id);
  return !error;
}
