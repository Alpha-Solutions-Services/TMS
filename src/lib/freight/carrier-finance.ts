import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeMoney, sanitizeText } from "./api-security";
import { fetchCarrierLoadsFromDb } from "./dispatch-loads-db";
import { listCarrierTrucks, type CarrierTruckRow } from "./carrier-trucks";

export const EXPENSE_CATEGORIES = [
  { id: "driver_compensation", label: "Driver Compensation" },
  { id: "management_fee", label: "Management Fee" },
  { id: "dispatch_fee", label: "Dispatch Fee" },
  { id: "factoring_fee", label: "Factoring Fee" },
  { id: "vektor_fee", label: "Vektor Fee" },
  { id: "maintenance_escrow", label: "Maintenance Escrow" },
  { id: "eld_fee", label: "ELD Fee" },
  { id: "permit_toll_fees", label: "Permit / Toll Fees" },
  { id: "storage_yard_fee", label: "Storage Yard Fee" },
  { id: "quickbooks", label: "QuickBooks" },
  { id: "insurance", label: "Insurance" },
  { id: "sintra_ai", label: "Sintra AI" },
  { id: "truck_payments", label: "Truck Payments" },
  { id: "trailer_payments", label: "Trailer Payments" },
  { id: "fuel", label: "Fuel (manual)" },
  { id: "other", label: "Other" },
] as const;

export type ExpenseCategoryId = (typeof EXPENSE_CATEGORIES)[number]["id"];

export type CarrierExpenseRow = {
  id: string;
  carrier_profile_id: string;
  category: string;
  label: string | null;
  amount: number;
  expense_date: string;
  week_of: string | null;
  truck_id: string | null;
  driver_profile_id: string | null;
  load_id: string | null;
  notes: string | null;
};

export type CarrierFuelLogRow = {
  id: string;
  carrier_profile_id: string;
  log_date: string;
  truck_id: string | null;
  driver_profile_id: string | null;
  location: string | null;
  gallons: number;
  cost: number;
  odometer: number | null;
  mpg: number | null;
  notes: string | null;
};

export type CarrierSettlementRow = {
  id: string;
  carrier_profile_id: string;
  load_id: string | null;
  invoice_number: string | null;
  broker: string | null;
  amount: number;
  invoice_date: string | null;
  due_date: string | null;
  status: string;
  payment_date: string | null;
  balance: number;
  notes: string | null;
};

function mondayOf(d: Date): string {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  return x.toISOString().slice(0, 10);
}

export async function listExpenses(
  carrierId: string,
): Promise<CarrierExpenseRow[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("carrier_expenses")
    .select("*")
    .eq("carrier_profile_id", carrierId)
    .order("expense_date", { ascending: false })
    .limit(500);
  if (error) {
    console.warn("[carrier-finance] expenses:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    ...(r as CarrierExpenseRow),
    amount: Number(r.amount) || 0,
  }));
}

export async function createExpense(opts: {
  carrierId: string;
  category: string;
  amount: number;
  expenseDate?: string;
  label?: string;
  truckId?: string | null;
  driverProfileId?: string | null;
  notes?: string;
}): Promise<{ row?: CarrierExpenseRow; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };
  const date = opts.expenseDate || new Date().toISOString().slice(0, 10);
  const { data, error } = await admin
    .from("carrier_expenses")
    .insert({
      carrier_profile_id: opts.carrierId,
      category: sanitizeText(opts.category, 60),
      label: opts.label ? sanitizeText(opts.label, 120) : null,
      amount: sanitizeMoney(opts.amount),
      expense_date: date,
      week_of: mondayOf(new Date(date)),
      truck_id: opts.truckId || null,
      driver_profile_id: opts.driverProfileId || null,
      notes: opts.notes ? sanitizeText(opts.notes, 300) : null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return {
    row: { ...(data as CarrierExpenseRow), amount: Number(data.amount) || 0 },
  };
}

export async function deleteExpense(
  carrierId: string,
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };
  const { error } = await admin
    .from("carrier_expenses")
    .delete()
    .eq("id", id)
    .eq("carrier_profile_id", carrierId);
  if (error) return { error: error.message };
  return { ok: true };
}

export async function listFuelLogs(
  carrierId: string,
): Promise<CarrierFuelLogRow[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("carrier_fuel_logs")
    .select("*")
    .eq("carrier_profile_id", carrierId)
    .order("log_date", { ascending: false })
    .limit(500);
  if (error) {
    console.warn("[carrier-finance] fuel:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    ...(r as CarrierFuelLogRow),
    gallons: Number(r.gallons) || 0,
    cost: Number(r.cost) || 0,
    odometer: r.odometer == null ? null : Number(r.odometer),
    mpg: r.mpg == null ? null : Number(r.mpg),
  }));
}

async function computeMpg(
  carrierId: string,
  truckId: string | null | undefined,
  odometer: number | null | undefined,
  gallons: number,
): Promise<number | null> {
  if (!truckId || odometer == null || !(gallons > 0)) return null;
  const admin = getServiceRoleClient();
  if (!admin) return null;
  const { data } = await admin
    .from("carrier_fuel_logs")
    .select("odometer")
    .eq("carrier_profile_id", carrierId)
    .eq("truck_id", truckId)
    .not("odometer", "is", null)
    .order("log_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1);
  const prev = data?.[0]?.odometer;
  if (prev == null) return null;
  const miles = odometer - Number(prev);
  if (!(miles > 0)) return null;
  return Math.round((miles / gallons) * 100) / 100;
}

export async function createFuelLog(opts: {
  carrierId: string;
  logDate?: string;
  truckId?: string | null;
  driverProfileId?: string | null;
  location?: string;
  gallons: number;
  cost: number;
  odometer?: number | null;
  notes?: string;
}): Promise<{ row?: CarrierFuelLogRow; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };
  const gallons = Number(opts.gallons) || 0;
  const mpg = await computeMpg(
    opts.carrierId,
    opts.truckId,
    opts.odometer,
    gallons,
  );
  const { data, error } = await admin
    .from("carrier_fuel_logs")
    .insert({
      carrier_profile_id: opts.carrierId,
      log_date: opts.logDate || new Date().toISOString().slice(0, 10),
      truck_id: opts.truckId || null,
      driver_profile_id: opts.driverProfileId || null,
      location: opts.location ? sanitizeText(opts.location, 120) : null,
      gallons,
      cost: sanitizeMoney(opts.cost),
      odometer: opts.odometer ?? null,
      mpg,
      notes: opts.notes ? sanitizeText(opts.notes, 300) : null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) return { error: error.message };
  return {
    row: {
      ...(data as CarrierFuelLogRow),
      gallons: Number(data.gallons) || 0,
      cost: Number(data.cost) || 0,
      odometer: data.odometer == null ? null : Number(data.odometer),
      mpg: data.mpg == null ? null : Number(data.mpg),
    },
  };
}

export async function deleteFuelLog(
  carrierId: string,
  id: string,
): Promise<{ ok?: true; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };
  const { error } = await admin
    .from("carrier_fuel_logs")
    .delete()
    .eq("id", id)
    .eq("carrier_profile_id", carrierId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Sync settlement rows from dispatch loads, then return merged list. */
export async function syncAndListSettlements(
  carrierId: string,
  companyName: string,
): Promise<CarrierSettlementRow[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const loads = await fetchCarrierLoadsFromDb({
    companyName,
    carrierProfileId: carrierId,
  });

  for (const load of loads) {
    const amount = Number(load.rc_invoice) || 0;
    const received = Number(load.received) || 0;
    const balance =
      load.balance != null && Number(load.balance) > 0
        ? Number(load.balance)
        : Math.max(0, amount - received);
    const statusRaw = String(load.status || "").toLowerCase();
    const status =
      statusRaw === "paid" || balance <= 0
        ? "Paid"
        : received > 0
          ? "Partial"
          : statusRaw.includes("unpaid")
            ? "Unpaid"
            : load.invoice
              ? String(load.invoice)
              : "Unpaid";

    const { data: existing } = await admin
      .from("carrier_settlements")
      .select("id, notes, due_date, payment_date, status")
      .eq("carrier_profile_id", carrierId)
      .eq("load_id", load.id)
      .maybeSingle();

    const patch = {
      carrier_profile_id: carrierId,
      load_id: load.id,
      invoice_number: load.load_number || `SR-${load.sr}`,
      broker: load.broker || null,
      amount,
      invoice_date: load.rc_date || null,
      balance,
      status: existing?.status && existing.status !== "Unpaid" && existing.status !== "Partial" && existing.status !== "Paid"
        ? existing.status
        : status,
      updated_at: new Date().toISOString(),
    };

    if (existing?.id) {
      await admin
        .from("carrier_settlements")
        .update({
          ...patch,
          // keep carrier-edited dates/notes
          due_date: existing.due_date,
          payment_date: existing.payment_date,
          notes: existing.notes,
        })
        .eq("id", existing.id);
    } else {
      await admin.from("carrier_settlements").insert(patch);
    }
  }

  const { data, error } = await admin
    .from("carrier_settlements")
    .select("*")
    .eq("carrier_profile_id", carrierId)
    .order("invoice_date", { ascending: false })
    .limit(500);
  if (error) {
    console.warn("[carrier-finance] settlements:", error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    ...(r as CarrierSettlementRow),
    amount: Number(r.amount) || 0,
    balance: Number(r.balance) || 0,
  }));
}

export async function updateSettlement(opts: {
  carrierId: string;
  id: string;
  status?: string;
  dueDate?: string | null;
  paymentDate?: string | null;
  notes?: string | null;
  balance?: number;
}): Promise<{ row?: CarrierSettlementRow; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };
  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (opts.status !== undefined) patch.status = sanitizeText(opts.status, 40);
  if (opts.dueDate !== undefined) patch.due_date = opts.dueDate;
  if (opts.paymentDate !== undefined) patch.payment_date = opts.paymentDate;
  if (opts.notes !== undefined) {
    patch.notes = opts.notes ? sanitizeText(opts.notes, 400) : null;
  }
  if (opts.balance !== undefined) patch.balance = sanitizeMoney(opts.balance);

  const { data, error } = await admin
    .from("carrier_settlements")
    .update(patch)
    .eq("id", opts.id)
    .eq("carrier_profile_id", opts.carrierId)
    .select("*")
    .single();
  if (error) return { error: error.message };
  return {
    row: {
      ...(data as CarrierSettlementRow),
      amount: Number(data.amount) || 0,
      balance: Number(data.balance) || 0,
    },
  };
}

export type FinanceSnapshot = {
  totals: {
    revenue: number;
    expenses: number;
    fuel_cost: number;
    fuel_gallons: number;
    profit: number;
    miles: number;
    rpm: number;
    margin: number;
    outstanding: number;
    paid: number;
  };
  by_category: { category: string; label: string; amount: number }[];
  by_month: {
    month: string;
    loads: number;
    revenue: number;
    expenses: number;
    profit: number;
    miles: number;
    rpm: number;
    margin: number;
  }[];
  by_truck: {
    truck_id: string;
    truck_number: string;
    driver: string;
    loads: number;
    revenue: number;
    weekly_expense: number;
    fuel: number;
    total_expense: number;
    profit: number;
    miles: number;
    rpm: number;
    cpm: number;
  }[];
  by_driver: {
    driver_id: string;
    driver: string;
    truck: string;
    loads: number;
    revenue: number;
    total_expense: number;
    profit: number;
    miles: number;
    rpm: number;
    margin: number;
    status: string;
  }[];
  trucks: CarrierTruckRow[];
};

export async function buildFinanceSnapshot(opts: {
  carrierId: string;
  companyName: string;
  drivers: { driver_id: string; name: string; status: string; truck_number?: string | null }[];
}): Promise<FinanceSnapshot> {
  const [loads, expenses, fuel, trucks, settlements] = await Promise.all([
    fetchCarrierLoadsFromDb({
      companyName: opts.companyName,
      carrierProfileId: opts.carrierId,
    }),
    listExpenses(opts.carrierId),
    listFuelLogs(opts.carrierId),
    listCarrierTrucks(opts.carrierId),
    syncAndListSettlements(opts.carrierId, opts.companyName),
  ]);

  const revenue = loads.reduce((s, l) => s + (Number(l.rc_invoice) || 0), 0);
  const miles = loads.reduce((s, l) => s + (Number(l.miles) || 0), 0);
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const fuelCost = fuel.reduce((s, f) => s + f.cost, 0);
  const fuelGallons = fuel.reduce((s, f) => s + f.gallons, 0);
  // Avoid double-counting fuel if also logged as expense category
  const expenseNonFuel = expenses
    .filter((e) => e.category !== "fuel")
    .reduce((s, e) => s + e.amount, 0);
  const totalExpenses = expenseNonFuel + fuelCost;
  const profit = revenue - totalExpenses;
  const rpm = miles > 0 ? Math.round((revenue / miles) * 100) / 100 : 0;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : 0;
  const outstanding = settlements
    .filter((s) => s.status !== "Paid")
    .reduce((s, r) => s + r.balance, 0);
  const paid = settlements
    .filter((s) => s.status === "Paid")
    .reduce((s, r) => s + r.amount, 0);

  const catMap = new Map<string, number>();
  for (const e of expenses) {
    catMap.set(e.category, (catMap.get(e.category) || 0) + e.amount);
  }
  if (fuelCost > 0) {
    catMap.set("fuel", (catMap.get("fuel") || 0) + fuelCost);
  }
  const by_category = EXPENSE_CATEGORIES.map((c) => ({
    category: c.id,
    label: c.label,
    amount: catMap.get(c.id) || 0,
  })).filter((c) => c.amount > 0);

  const monthMap = new Map<
    string,
    { loads: number; revenue: number; expenses: number; miles: number }
  >();
  for (const l of loads) {
    const m = (l.rc_date || l.created_at || "").toString().slice(0, 7) || "Unknown";
    const cur = monthMap.get(m) || { loads: 0, revenue: 0, expenses: 0, miles: 0 };
    cur.loads += 1;
    cur.revenue += Number(l.rc_invoice) || 0;
    cur.miles += Number(l.miles) || 0;
    monthMap.set(m, cur);
  }
  for (const e of expenses) {
    const m = e.expense_date.slice(0, 7);
    const cur = monthMap.get(m) || { loads: 0, revenue: 0, expenses: 0, miles: 0 };
    if (e.category !== "fuel") cur.expenses += e.amount;
    monthMap.set(m, cur);
  }
  for (const f of fuel) {
    const m = f.log_date.slice(0, 7);
    const cur = monthMap.get(m) || { loads: 0, revenue: 0, expenses: 0, miles: 0 };
    cur.expenses += f.cost;
    monthMap.set(m, cur);
  }
  const by_month = Array.from(monthMap.entries())
    .map(([month, v]) => {
      const p = v.revenue - v.expenses;
      return {
        month,
        loads: v.loads,
        revenue: v.revenue,
        expenses: v.expenses,
        profit: p,
        miles: v.miles,
        rpm: v.miles > 0 ? Math.round((v.revenue / v.miles) * 100) / 100 : 0,
        margin: v.revenue > 0 ? Math.round((p / v.revenue) * 1000) / 10 : 0,
      };
    })
    .sort((a, b) => b.month.localeCompare(a.month));

  const driverById = new Map(opts.drivers.map((d) => [d.driver_id, d]));
  const truckFuel = new Map<string, number>();
  for (const f of fuel) {
    if (!f.truck_id) continue;
    truckFuel.set(f.truck_id, (truckFuel.get(f.truck_id) || 0) + f.cost);
  }
  const truckExpense = new Map<string, number>();
  for (const e of expenses) {
    if (!e.truck_id || e.category === "fuel") continue;
    truckExpense.set(e.truck_id, (truckExpense.get(e.truck_id) || 0) + e.amount);
  }

  // Allocate load revenue/miles to truck via assigned driver
  const by_truck = trucks.map((t) => {
    const driver = t.assigned_driver_profile_id
      ? driverById.get(t.assigned_driver_profile_id)
      : undefined;
    const truckLoads = loads.filter(
      (l) =>
        l.assigned_driver_profile_id &&
        l.assigned_driver_profile_id === t.assigned_driver_profile_id,
    );
    const rev = truckLoads.reduce((s, l) => s + (Number(l.rc_invoice) || 0), 0);
    const mi = truckLoads.reduce((s, l) => s + (Number(l.miles) || 0), 0);
    const fuelAmt = truckFuel.get(t.id) || 0;
    const other = truckExpense.get(t.id) || 0;
    const totalExp = fuelAmt + other;
    const p = rev - totalExp;
    return {
      truck_id: t.id,
      truck_number: t.truck_number,
      driver: driver?.name || "Unassigned",
      loads: truckLoads.length,
      revenue: rev,
      weekly_expense: other,
      fuel: fuelAmt,
      total_expense: totalExp,
      profit: p,
      miles: mi,
      rpm: mi > 0 ? Math.round((rev / mi) * 100) / 100 : 0,
      cpm: mi > 0 ? Math.round((totalExp / mi) * 100) / 100 : 0,
    };
  });

  const driverExpense = new Map<string, number>();
  for (const e of expenses) {
    if (!e.driver_profile_id || e.category === "fuel") continue;
    driverExpense.set(
      e.driver_profile_id,
      (driverExpense.get(e.driver_profile_id) || 0) + e.amount,
    );
  }
  for (const f of fuel) {
    if (!f.driver_profile_id) continue;
    driverExpense.set(
      f.driver_profile_id,
      (driverExpense.get(f.driver_profile_id) || 0) + f.cost,
    );
  }

  const by_driver = opts.drivers.map((d) => {
    const dLoads = loads.filter((l) => l.assigned_driver_profile_id === d.driver_id);
    const rev = dLoads.reduce((s, l) => s + (Number(l.rc_invoice) || 0), 0);
    const mi = dLoads.reduce((s, l) => s + (Number(l.miles) || 0), 0);
    const exp = driverExpense.get(d.driver_id) || 0;
    const p = rev - exp;
    const truck =
      trucks.find((t) => t.assigned_driver_profile_id === d.driver_id)?.truck_number ||
      d.truck_number ||
      "—";
    return {
      driver_id: d.driver_id,
      driver: d.name,
      truck: String(truck),
      loads: dLoads.length,
      revenue: rev,
      total_expense: exp,
      profit: p,
      miles: mi,
      rpm: mi > 0 ? Math.round((rev / mi) * 100) / 100 : 0,
      margin: rev > 0 ? Math.round((p / rev) * 1000) / 10 : 0,
      status: d.status,
    };
  });

  return {
    totals: {
      revenue,
      expenses: totalExpenses,
      fuel_cost: fuelCost,
      fuel_gallons: Math.round(fuelGallons * 100) / 100,
      profit,
      miles,
      rpm,
      margin,
      outstanding,
      paid,
    },
    by_category,
    by_month,
    by_truck,
    by_driver,
    trucks,
  };
}
