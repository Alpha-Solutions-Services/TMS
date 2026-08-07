"use client";

import { useCallback, useEffect, useState } from "react";
import { Fuel, Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  CarrierGlassCard,
  CarrierStatusBadge,
} from "@/components/freight/carrier/CarrierGlassCard";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";
import { useCarrierDashboard } from "@/components/freight/useCarrierDashboard";
import type { FinanceSnapshot } from "@/lib/freight/carrier-finance";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

type Tab =
  | "overview"
  | "settlements"
  | "expenses"
  | "fuel"
  | "trucks"
  | "drivers";

type ExpenseRow = {
  id: string;
  category: string;
  label: string | null;
  amount: number;
  expense_date: string;
  notes: string | null;
  truck_id: string | null;
  driver_profile_id: string | null;
};

type FuelRow = {
  id: string;
  log_date: string;
  truck_id: string | null;
  driver_profile_id: string | null;
  location: string | null;
  gallons: number;
  cost: number;
  odometer: number | null;
  mpg: number | null;
};

type SettlementRow = {
  id: string;
  invoice_number: string | null;
  load_id: string | null;
  broker: string | null;
  amount: number;
  invoice_date: string | null;
  due_date: string | null;
  status: string;
  payment_date: string | null;
  balance: number;
  notes: string | null;
};

type Category = { id: string; label: string };

export function CarrierBusinessClient({
  initialTab = "overview",
}: {
  initialTab?: Tab;
}) {
  const { data: dash } = useCarrierDashboard();
  const [tab, setTab] = useState<Tab>(initialTab);
  const [snap, setSnap] = useState<FinanceSnapshot | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [expenses, setExpenses] = useState<ExpenseRow[]>([]);
  const [fuel, setFuel] = useState<FuelRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const [expForm, setExpForm] = useState({
    category: "factoring_fee",
    amount: "",
    expenseDate: new Date().toISOString().slice(0, 10),
    notes: "",
    truckId: "",
    driverProfileId: "",
  });
  const [fuelForm, setFuelForm] = useState({
    logDate: new Date().toISOString().slice(0, 10),
    truckId: "",
    driverProfileId: "",
    location: "",
    gallons: "",
    cost: "",
    odometer: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [sumRes, expRes, fuelRes, setRes] = await Promise.all([
        fetch("/api/freight/carrier/finance?view=summary", { cache: "no-store" }),
        fetch("/api/freight/carrier/finance?view=expenses", { cache: "no-store" }),
        fetch("/api/freight/carrier/finance?view=fuel", { cache: "no-store" }),
        fetch("/api/freight/carrier/finance?view=settlements", {
          cache: "no-store",
        }),
      ]);
      const sumJson = await sumRes.json();
      const expJson = await expRes.json();
      const fuelJson = await fuelRes.json();
      const setJson = await setRes.json();
      if (!sumRes.ok) throw new Error(sumJson.error ?? "Failed");
      setSnap(sumJson as FinanceSnapshot);
      setCategories(sumJson.categories ?? expJson.categories ?? []);
      setExpenses(expJson.expenses ?? []);
      setFuel(fuelJson.fuel ?? []);
      setSettlements(setJson.settlements ?? []);
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load finance");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function addExpense() {
    const amount = Number(expForm.amount);
    if (!(amount > 0)) {
      setMsg("Enter an expense amount");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/freight/carrier/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "expense",
          category: expForm.category,
          amount,
          expenseDate: expForm.expenseDate,
          notes: expForm.notes || undefined,
          truckId: expForm.truckId || null,
          driverProfileId: expForm.driverProfileId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setExpForm((f) => ({ ...f, amount: "", notes: "" }));
      setMsg("Expense saved.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addFuel() {
    const gallons = Number(fuelForm.gallons);
    const cost = Number(fuelForm.cost);
    if (!(gallons > 0) || !(cost >= 0)) {
      setMsg("Enter gallons and cost");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/freight/carrier/finance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "fuel",
          logDate: fuelForm.logDate,
          truckId: fuelForm.truckId || null,
          driverProfileId: fuelForm.driverProfileId || null,
          location: fuelForm.location || undefined,
          gallons,
          cost,
          odometer: fuelForm.odometer ? Number(fuelForm.odometer) : null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setFuelForm((f) => ({
        ...f,
        gallons: "",
        cost: "",
        odometer: "",
        location: "",
      }));
      setMsg("Fuel log saved.");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeRow(kind: "expense" | "fuel", id: string) {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/freight/carrier/finance?kind=${kind}&id=${id}`,
        { method: "DELETE" },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchSettlement(
    id: string,
    patch: { status?: string; notes?: string; paymentDate?: string },
  ) {
    setBusy(true);
    try {
      const res = await fetch("/api/freight/carrier/finance", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "settlement", id, ...patch }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "P&L Overview" },
    { id: "settlements", label: "Settlements" },
    { id: "expenses", label: "Expenses" },
    { id: "fuel", label: "Fuel" },
    { id: "trucks", label: "Truck P&L" },
    { id: "drivers", label: "Driver P&L" },
  ];

  const t = snap?.totals;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar
        title="Business & money"
        companyName={dash?.carrier.company_name ?? "Carrier"}
      />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-[var(--color-muted)]">
            All-in-one ops: broker settlements, factoring/dispatch/insurance fees,
            fuel gallons & MPG, truck and driver profit.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>

        <div className="flex flex-wrap gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-1">
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setTab(x.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === x.id
                  ? "bg-[var(--color-accent)] text-[#05080f]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]"
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>

        {msg ? (
          <p className="text-sm text-[var(--color-muted)]">{msg}</p>
        ) : null}

        {loading && !snap ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading business data…
          </p>
        ) : null}

        {tab === "overview" && t ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CarrierGlassCard glow>
                <p className="text-xs uppercase text-[var(--color-muted)]">Revenue</p>
                <p className="mt-1 text-2xl font-bold text-emerald-400">
                  {formatUsd(t.revenue)}
                </p>
              </CarrierGlassCard>
              <CarrierGlassCard glow>
                <p className="text-xs uppercase text-[var(--color-muted)]">
                  Total expenses
                </p>
                <p className="mt-1 text-2xl font-bold text-orange-300">
                  {formatUsd(t.expenses)}
                </p>
              </CarrierGlassCard>
              <CarrierGlassCard glow>
                <p className="text-xs uppercase text-[var(--color-muted)]">Profit</p>
                <p
                  className={`mt-1 text-2xl font-bold ${
                    t.profit >= 0 ? "text-emerald-400" : "text-red-300"
                  }`}
                >
                  {formatUsd(t.profit)}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  Margin {t.margin}% · RPM ${t.rpm}
                </p>
              </CarrierGlassCard>
              <CarrierGlassCard>
                <p className="text-xs uppercase text-[var(--color-muted)]">Fuel</p>
                <p className="mt-1 text-2xl font-bold">{formatUsd(t.fuel_cost)}</p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {t.fuel_gallons} gal · Outstanding AR {formatUsd(t.outstanding)}
                </p>
              </CarrierGlassCard>
            </div>

            <CarrierGlassCard>
              <p className="text-sm font-semibold">Expense breakdown</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-xs uppercase text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-2">Category</th>
                      <th className="px-2 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {(snap?.by_category ?? []).map((c) => (
                      <tr key={c.category}>
                        <td className="px-2 py-2">{c.label}</td>
                        <td className="px-2 py-2 tabular-nums text-orange-300">
                          {formatUsd(c.amount)}
                        </td>
                      </tr>
                    ))}
                    {(snap?.by_category ?? []).length === 0 ? (
                      <tr>
                        <td
                          colSpan={2}
                          className="px-2 py-6 text-center text-[var(--color-muted)]"
                        >
                          Log factoring, insurance, truck payments, and more under
                          Expenses.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </CarrierGlassCard>

            <CarrierGlassCard>
              <p className="text-sm font-semibold">Monthly P&L</p>
              <div className="mt-3 overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="uppercase text-[var(--color-muted)]">
                    <tr>
                      <th className="px-2 py-2">Month</th>
                      <th className="px-2 py-2">Loads</th>
                      <th className="px-2 py-2">Revenue</th>
                      <th className="px-2 py-2">Expenses</th>
                      <th className="px-2 py-2">Profit</th>
                      <th className="px-2 py-2">Miles</th>
                      <th className="px-2 py-2">RPM</th>
                      <th className="px-2 py-2">Margin</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {(snap?.by_month ?? []).map((m) => (
                      <tr key={m.month}>
                        <td className="px-2 py-2 font-medium">{m.month}</td>
                        <td className="px-2 py-2">{m.loads}</td>
                        <td className="px-2 py-2 text-emerald-400">
                          {formatUsd(m.revenue)}
                        </td>
                        <td className="px-2 py-2 text-orange-300">
                          {formatUsd(m.expenses)}
                        </td>
                        <td className="px-2 py-2">{formatUsd(m.profit)}</td>
                        <td className="px-2 py-2">{m.miles.toLocaleString()}</td>
                        <td className="px-2 py-2">${m.rpm}</td>
                        <td className="px-2 py-2">{m.margin}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CarrierGlassCard>
          </div>
        ) : null}

        {tab === "settlements" ? (
          <CarrierGlassCard className="overflow-hidden p-0">
            <div className="border-b border-[var(--color-border)] px-4 py-3">
              <p className="text-sm font-semibold">Broker settlements (AR)</p>
              <p className="text-xs text-[var(--color-muted)]">
                Synced from your loads — track what brokers owe you (not Alpha fees).
              </p>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="bg-[var(--color-surface)]/80 uppercase text-[var(--color-muted)]">
                  <tr>
                    <th className="px-3 py-2">Invoice #</th>
                    <th className="px-3 py-2">Broker</th>
                    <th className="px-3 py-2">Amount</th>
                    <th className="px-3 py-2">Invoice date</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Balance</th>
                    <th className="px-3 py-2">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {settlements.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-[var(--color-muted)]"
                      >
                        No load settlements yet.
                      </td>
                    </tr>
                  ) : (
                    settlements.map((s) => (
                      <tr key={s.id}>
                        <td className="px-3 py-2 font-medium text-[var(--color-accent)]">
                          {s.invoice_number || "—"}
                        </td>
                        <td className="px-3 py-2">{s.broker || "—"}</td>
                        <td className="px-3 py-2 text-emerald-400">
                          {formatUsd(s.amount)}
                        </td>
                        <td className="px-3 py-2">{s.invoice_date || "—"}</td>
                        <td className="px-3 py-2">
                          <select
                            className="rounded border border-[var(--color-border)] bg-[#050912] px-1 py-0.5 text-xs"
                            value={s.status}
                            disabled={busy}
                            onChange={(e) =>
                              void patchSettlement(s.id, {
                                status: e.target.value,
                                paymentDate:
                                  e.target.value === "Paid"
                                    ? new Date().toISOString().slice(0, 10)
                                    : undefined,
                              })
                            }
                          >
                            <option>Unpaid</option>
                            <option>Partial</option>
                            <option>Paid</option>
                            <option>Factored</option>
                          </select>
                        </td>
                        <td className="px-3 py-2 text-orange-300">
                          {formatUsd(s.balance)}
                        </td>
                        <td className="px-3 py-2">
                          <input
                            className="w-36 rounded border border-[var(--color-border)] bg-[#050912] px-1 py-0.5 text-xs"
                            defaultValue={s.notes || ""}
                            placeholder="Note"
                            onBlur={(e) => {
                              if (e.target.value !== (s.notes || "")) {
                                void patchSettlement(s.id, {
                                  notes: e.target.value,
                                });
                              }
                            }}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CarrierGlassCard>
        ) : null}

        {tab === "expenses" ? (
          <div className="space-y-4">
            <CarrierGlassCard>
              <p className="text-sm font-semibold">Log expense</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Factoring, dispatch, insurance, truck/trailer payments, ELD, permits…
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
                <select
                  value={expForm.category}
                  onChange={(e) =>
                    setExpForm((f) => ({ ...f, category: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  placeholder="Amount"
                  value={expForm.amount}
                  onChange={(e) =>
                    setExpForm((f) => ({ ...f, amount: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <input
                  type="date"
                  value={expForm.expenseDate}
                  onChange={(e) =>
                    setExpForm((f) => ({ ...f, expenseDate: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <select
                  value={expForm.truckId}
                  onChange={(e) =>
                    setExpForm((f) => ({ ...f, truckId: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                >
                  <option value="">Truck (optional)</option>
                  {(snap?.trucks ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.truck_number}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Notes"
                  value={expForm.notes}
                  onChange={(e) =>
                    setExpForm((f) => ({ ...f, notes: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void addExpense()}
                  className="inline-flex items-center justify-center gap-1 rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
                >
                  <Plus className="h-4 w-4" /> Add
                </button>
              </div>
            </CarrierGlassCard>

            <CarrierGlassCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Category</th>
                      <th className="px-3 py-2">Amount</th>
                      <th className="px-3 py-2">Notes</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td className="px-3 py-2">{e.expense_date}</td>
                        <td className="px-3 py-2">
                          {categories.find((c) => c.id === e.category)?.label ||
                            e.category}
                        </td>
                        <td className="px-3 py-2 text-orange-300">
                          {formatUsd(e.amount)}
                        </td>
                        <td className="px-3 py-2 text-[var(--color-muted)]">
                          {e.notes || "—"}
                        </td>
                        <td className="px-3 py-2">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeRow("expense", e.id)}
                            className="text-red-300"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CarrierGlassCard>
          </div>
        ) : null}

        {tab === "fuel" ? (
          <div className="space-y-4">
            <CarrierGlassCard>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <Fuel className="h-4 w-4 text-[var(--color-accent)]" />
                Log fuel fill-up
              </p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                Enter gallons, cost, and odometer — MPG is calculated from the previous
                reading on that truck.
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-7">
                <input
                  type="date"
                  value={fuelForm.logDate}
                  onChange={(e) =>
                    setFuelForm((f) => ({ ...f, logDate: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <select
                  value={fuelForm.truckId}
                  onChange={(e) =>
                    setFuelForm((f) => ({ ...f, truckId: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                >
                  <option value="">Truck</option>
                  {(snap?.trucks ?? []).map((t) => (
                    <option key={t.id} value={t.id}>
                      #{t.truck_number}
                    </option>
                  ))}
                </select>
                <select
                  value={fuelForm.driverProfileId}
                  onChange={(e) =>
                    setFuelForm((f) => ({
                      ...f,
                      driverProfileId: e.target.value,
                    }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                >
                  <option value="">Driver</option>
                  {(dash?.drivers ?? []).map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.name}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="Location"
                  value={fuelForm.location}
                  onChange={(e) =>
                    setFuelForm((f) => ({ ...f, location: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Gallons"
                  value={fuelForm.gallons}
                  onChange={(e) =>
                    setFuelForm((f) => ({ ...f, gallons: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  step="0.01"
                  placeholder="Cost $"
                  value={fuelForm.cost}
                  onChange={(e) =>
                    setFuelForm((f) => ({ ...f, cost: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
                <input
                  type="number"
                  placeholder="Odometer"
                  value={fuelForm.odometer}
                  onChange={(e) =>
                    setFuelForm((f) => ({ ...f, odometer: e.target.value }))
                  }
                  className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-2 text-sm"
                />
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addFuel()}
                className="mt-3 inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
              >
                <Plus className="h-4 w-4" /> Save fuel log
              </button>
            </CarrierGlassCard>

            <CarrierGlassCard className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-xs sm:text-sm">
                  <thead className="bg-[var(--color-surface)]/80 uppercase text-[var(--color-muted)]">
                    <tr>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Week</th>
                      <th className="px-3 py-2">Truck</th>
                      <th className="px-3 py-2">Location</th>
                      <th className="px-3 py-2">Gallons</th>
                      <th className="px-3 py-2">MPG</th>
                      <th className="px-3 py-2">Cost</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border)]">
                    {fuel.map((f) => {
                      const truck = (snap?.trucks ?? []).find(
                        (t) => t.id === f.truck_id,
                      );
                      const d = new Date(f.log_date + "T12:00:00");
                      const week = Math.ceil(d.getDate() / 7);
                      return (
                        <tr key={f.id}>
                          <td className="px-3 py-2">{f.log_date}</td>
                          <td className="px-3 py-2">W{week}</td>
                          <td className="px-3 py-2">
                            {truck ? `#${truck.truck_number}` : "—"}
                          </td>
                          <td className="px-3 py-2">{f.location || "—"}</td>
                          <td className="px-3 py-2">{f.gallons}</td>
                          <td className="px-3 py-2">
                            {f.mpg != null ? f.mpg : "—"}
                          </td>
                          <td className="px-3 py-2 text-orange-300">
                            {formatUsd(f.cost)}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void removeRow("fuel", f.id)}
                              className="text-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CarrierGlassCard>
          </div>
        ) : null}

        {tab === "trucks" ? (
          <CarrierGlassCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="bg-[var(--color-surface)]/80 uppercase text-[var(--color-muted)]">
                  <tr>
                    <th className="px-3 py-2">Truck #</th>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Loads</th>
                    <th className="px-3 py-2">Revenue</th>
                    <th className="px-3 py-2">Weekly exp</th>
                    <th className="px-3 py-2">Fuel</th>
                    <th className="px-3 py-2">Total exp</th>
                    <th className="px-3 py-2">Profit</th>
                    <th className="px-3 py-2">Miles</th>
                    <th className="px-3 py-2">RPM</th>
                    <th className="px-3 py-2">CPM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(snap?.by_truck ?? []).map((r) => (
                    <tr key={r.truck_id}>
                      <td className="px-3 py-2 font-medium">#{r.truck_number}</td>
                      <td className="px-3 py-2">{r.driver}</td>
                      <td className="px-3 py-2">{r.loads}</td>
                      <td className="px-3 py-2 text-emerald-400">
                        {formatUsd(r.revenue)}
                      </td>
                      <td className="px-3 py-2">{formatUsd(r.weekly_expense)}</td>
                      <td className="px-3 py-2">{formatUsd(r.fuel)}</td>
                      <td className="px-3 py-2 text-orange-300">
                        {formatUsd(r.total_expense)}
                      </td>
                      <td className="px-3 py-2">{formatUsd(r.profit)}</td>
                      <td className="px-3 py-2">{r.miles.toLocaleString()}</td>
                      <td className="px-3 py-2">${r.rpm}</td>
                      <td className="px-3 py-2">${r.cpm}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarrierGlassCard>
        ) : null}

        {tab === "drivers" ? (
          <CarrierGlassCard className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-xs sm:text-sm">
                <thead className="bg-[var(--color-surface)]/80 uppercase text-[var(--color-muted)]">
                  <tr>
                    <th className="px-3 py-2">Driver</th>
                    <th className="px-3 py-2">Assigned truck</th>
                    <th className="px-3 py-2">Loads</th>
                    <th className="px-3 py-2">Revenue</th>
                    <th className="px-3 py-2">Total expense</th>
                    <th className="px-3 py-2">Profit</th>
                    <th className="px-3 py-2">Miles</th>
                    <th className="px-3 py-2">RPM</th>
                    <th className="px-3 py-2">Margin</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {(snap?.by_driver ?? []).map((r) => (
                    <tr key={r.driver_id}>
                      <td className="px-3 py-2 font-medium">{r.driver}</td>
                      <td className="px-3 py-2">{r.truck}</td>
                      <td className="px-3 py-2">{r.loads}</td>
                      <td className="px-3 py-2 text-emerald-400">
                        {formatUsd(r.revenue)}
                      </td>
                      <td className="px-3 py-2 text-orange-300">
                        {formatUsd(r.total_expense)}
                      </td>
                      <td className="px-3 py-2">{formatUsd(r.profit)}</td>
                      <td className="px-3 py-2">{r.miles.toLocaleString()}</td>
                      <td className="px-3 py-2">${r.rpm}</td>
                      <td className="px-3 py-2">{r.margin}%</td>
                      <td className="px-3 py-2">
                        <CarrierStatusBadge status={r.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarrierGlassCard>
        ) : null}
      </div>
    </div>
  );
}
