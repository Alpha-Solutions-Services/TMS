"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";
import type { CarrierCompliance, CarrierSummary, CarrierTruck } from "@/lib/freight/carrier-dashboard-types";
import type { CarrierPortalConfig } from "@/lib/freight/carrier-portal-db";

const emptyCompliance = (): CarrierCompliance => ({
  insurance_status: "Active",
  insurance_expiry: "",
  mc_authority: "Active",
  mc_expiry: "",
  cdl_expiry: "",
  ifta_due: "",
  registration_expiry: "",
});

const emptyTruck = (): CarrierTruck => ({
  truck_id: `TRK-${Date.now()}`,
  truck_number: "",
  driver: "",
  equipment: "Dry Van",
  location: "",
  status: "Available",
});

export function DispatcherCarrierPortalPage() {
  const { data, loading } = useDispatchDashboard();
  const [carrier, setCarrier] = useState("");
  const [trucks, setTrucks] = useState<CarrierTruck[]>([]);
  const [compliance, setCompliance] = useState<CarrierCompliance>(emptyCompliance());
  const [dispatcherName, setDispatcherName] = useState("Alpha Dispatch");
  const [dispatcherEmail, setDispatcherEmail] = useState("");
  const [dispatcherPhone, setDispatcherPhone] = useState("");
  const [fuelExpense, setFuelExpense] = useState("");
  const [maintenanceAlerts, setMaintenanceAlerts] = useState("");
  const [kpiOverrides, setKpiOverrides] = useState<Partial<CarrierSummary>>({});
  const [useKpiOverrides, setUseKpiOverrides] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const carriers = useMemo(() => data?.carriers ?? [], [data?.carriers]);
  const matchedCarrier = useMemo(
    () => carriers.find((c) => c.company_name === carrier),
    [carriers, carrier],
  );

  useEffect(() => {
    if (!carrier && carriers[0]) setCarrier(carriers[0].company_name);
  }, [carriers, carrier]);

  const loadConfig = useCallback(async (companyName: string) => {
    if (!companyName) return;
    setConfigLoading(true);
    setMsg(null);
    try {
      const res = await fetch(
        `/api/dispatcher/carrier-portal?companyName=${encodeURIComponent(companyName)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { portalConfig?: CarrierPortalConfig; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load config");

      const cfg = json.portalConfig ?? {};
      setTrucks(cfg.trucks ?? []);
      setCompliance({ ...emptyCompliance(), ...cfg.compliance });
      setDispatcherName(cfg.dispatcher?.name ?? "Alpha Dispatch");
      setDispatcherEmail(cfg.dispatcher?.email ?? "");
      setDispatcherPhone(cfg.dispatcher?.phone ?? "");
      setFuelExpense(cfg.fuel_expense_month != null ? String(cfg.fuel_expense_month) : "");
      setMaintenanceAlerts(
        cfg.maintenance_alerts != null ? String(cfg.maintenance_alerts) : "",
      );
      setKpiOverrides(cfg.summary_overrides ?? {});
      setUseKpiOverrides(Boolean(cfg.summary_overrides && Object.keys(cfg.summary_overrides).length));
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed");
    } finally {
      setConfigLoading(false);
    }
  }, []);

  useEffect(() => {
    if (carrier) void loadConfig(carrier);
  }, [carrier, loadConfig]);

  async function save() {
    if (!carrier.trim()) {
      setMsg("Select a carrier.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const portalConfig: CarrierPortalConfig = {
        trucks,
        compliance,
        dispatcher: {
          name: dispatcherName.trim() || "Alpha Dispatch",
          email: dispatcherEmail.trim() || "—",
          phone: dispatcherPhone.trim() || "—",
        },
        fuel_expense_month: fuelExpense ? Number.parseFloat(fuelExpense) : 0,
        maintenance_alerts: maintenanceAlerts ? Number.parseInt(maintenanceAlerts, 10) : 0,
      };

      if (useKpiOverrides && Object.keys(kpiOverrides).length) {
        portalConfig.summary_overrides = kpiOverrides;
      }

      const res = await fetch("/api/dispatcher/carrier-portal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: carrier,
          carrierProfileId:
            matchedCarrier?.source === "supabase" ? matchedCarrier.carrier_id : undefined,
          portalConfig,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setMsg("Carrier portal updated — carrier will see changes on refresh.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save error");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) {
    return <p className="p-8 text-[var(--color-muted)]">Loading…</p>;
  }

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Edit carrier portal</h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Customize trucks, compliance, dispatcher contact, and KPI overrides. Loads and drivers come from Supabase only — no fake data.
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-5 space-y-6">
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">Carrier</span>
          <select
            value={carrier}
            onChange={(e) => setCarrier(e.target.value)}
            className="dispatch-field mt-1 w-full max-w-md rounded-lg border border-[var(--color-border)] px-3 py-2"
          >
            {carriers.map((c) => (
              <option key={c.carrier_id} value={c.company_name}>
                {c.company_name}
              </option>
            ))}
          </select>
        </label>

        {configLoading ? (
          <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading portal settings…
          </p>
        ) : null}

        <section>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Fleet trucks</h2>
            <button
              type="button"
              onClick={() => setTrucks((t) => [...t, emptyTruck()])}
              className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
            >
              <Plus className="h-3 w-3" />
              Add truck
            </button>
          </div>
          {trucks.length === 0 ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">No trucks added yet.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {trucks.map((truck, idx) => (
                <div
                  key={truck.truck_id}
                  className="grid gap-2 rounded-xl border border-[var(--color-border)] p-3 sm:grid-cols-3"
                >
                  {(
                    [
                      ["truck_number", "Truck #"],
                      ["driver", "Driver"],
                      ["equipment", "Equipment"],
                      ["location", "Location"],
                      ["status", "Status"],
                    ] as const
                  ).map(([field, label]) => (
                    <label key={field} className="block text-xs">
                      <span className="text-[var(--color-muted)]">{label}</span>
                      <input
                        value={truck[field]}
                        onChange={(e) =>
                          setTrucks((rows) =>
                            rows.map((r, i) =>
                              i === idx ? { ...r, [field]: e.target.value } : r,
                            ),
                          )
                        }
                        className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
                      />
                    </label>
                  ))}
                  <div className="flex items-end sm:col-span-3">
                    <button
                      type="button"
                      onClick={() => setTrucks((rows) => rows.filter((_, i) => i !== idx))}
                      className="inline-flex items-center gap-1 text-xs text-red-300"
                    >
                      <Trash2 className="h-3 w-3" />
                      Remove
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Compliance</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {(
              [
                ["insurance_status", "Insurance status"],
                ["insurance_expiry", "Insurance expiry"],
                ["mc_authority", "MC authority"],
                ["mc_expiry", "MC expiry"],
                ["cdl_expiry", "CDL expiry"],
                ["ifta_due", "IFTA due"],
                ["registration_expiry", "Registration expiry"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="block text-xs">
                <span className="text-[var(--color-muted)]">{label}</span>
                <input
                  value={compliance[field]}
                  onChange={(e) =>
                    setCompliance((c) => ({ ...c, [field]: e.target.value }))
                  }
                  className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
                />
              </label>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Dispatcher contact</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <label className="block text-xs">
              <span className="text-[var(--color-muted)]">Name</span>
              <input
                value={dispatcherName}
                onChange={(e) => setDispatcherName(e.target.value)}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--color-muted)]">Email</span>
              <input
                type="email"
                value={dispatcherEmail}
                onChange={(e) => setDispatcherEmail(e.target.value)}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--color-muted)]">Phone</span>
              <input
                value={dispatcherPhone}
                onChange={(e) => setDispatcherPhone(e.target.value)}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
              />
            </label>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Other metrics</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-[var(--color-muted)]">Fuel expense (month $)</span>
              <input
                type="number"
                min={0}
                value={fuelExpense}
                onChange={(e) => setFuelExpense(e.target.value)}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
              />
            </label>
            <label className="block text-xs">
              <span className="text-[var(--color-muted)]">Maintenance alerts count</span>
              <input
                type="number"
                min={0}
                value={maintenanceAlerts}
                onChange={(e) => setMaintenanceAlerts(e.target.value)}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
              />
            </label>
          </div>
        </section>

        <section>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={useKpiOverrides}
              onChange={(e) => setUseKpiOverrides(e.target.checked)}
            />
            <span className="text-[var(--color-text)]">Override auto-calculated KPIs</span>
          </label>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            By default KPIs are calculated from real loads. Enable to set custom values.
          </p>
          {useKpiOverrides ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {(
                [
                  ["weekly_revenue", "Weekly revenue ($)"],
                  ["monthly_revenue", "Monthly revenue ($)"],
                  ["active_loads", "Active loads"],
                  ["rpm", "RPM ($)"],
                  ["miles_driven", "Miles driven"],
                  ["outstanding_invoices", "Outstanding invoices ($)"],
                ] as const
              ).map(([field, label]) => (
                <label key={field} className="block text-xs">
                  <span className="text-[var(--color-muted)]">{label}</span>
                  <input
                    type="number"
                    min={0}
                    value={kpiOverrides[field] ?? ""}
                    onChange={(e) =>
                      setKpiOverrides((k) => ({
                        ...k,
                        [field]: e.target.value ? Number.parseFloat(e.target.value) : undefined,
                      }))
                    }
                    className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-2 py-1.5"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </section>

        <button
          type="button"
          disabled={busy || configLoading}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Save to carrier portal
        </button>
        {msg ? <p className="text-sm text-[var(--color-muted)]">{msg}</p> : null}
      </div>
    </div>
  );
}
