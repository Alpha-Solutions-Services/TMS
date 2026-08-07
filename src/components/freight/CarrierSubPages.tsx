"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, MapPin, Phone, RefreshCw, Sparkles, Upload } from "lucide-react";
import { InviteDriverModal } from "@/components/freight/InviteDriverModal";
import { DriverInvitationList } from "@/components/freight/DriverInvitationList";
import { LoadDocumentsPanel } from "@/components/freight/LoadDocumentsPanel";
import { DispatcherFleetMap } from "@/components/freight/DispatcherFleetMap";
import {
  CarrierGlassCard,
  CarrierStatusBadge,
} from "@/components/freight/carrier/CarrierGlassCard";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";
import { useCarrierDashboard } from "@/components/freight/useCarrierDashboard";
import { useUi } from "@/components/ui/UiProvider";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function CarrierPageShell({
  title,
  children,
  loading,
  companyName,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  companyName: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar title={title} companyName={companyName} />
      <div className="p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--color-muted)]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function useCarrierPage() {
  const { data, loading, error, refresh } = useCarrierDashboard();
  return { data, loading, error, refresh, company: data?.carrier.company_name ?? "Carrier" };
}

export function CarrierLoadsPage() {
  const { data, loading, company, refresh } = useCarrierPage();
  const [docsLoadId, setDocsLoadId] = useState<string | null>(null);
  const [docsLabel, setDocsLabel] = useState<string>("");

  return (
    <CarrierPageShell title="Loads" loading={loading && !data} companyName={company}>
      {docsLoadId ? (
        <LoadDocumentsPanel
          loadId={docsLoadId}
          loadLabel={docsLabel}
          onClose={() => setDocsLoadId(null)}
        />
      ) : null}
      {data ? (
        <>
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs text-[var(--color-muted)]">
              Auto-updates every 20s · includes loads assigned to your drivers · open Docs for
              BOL / commodity / POD
            </p>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Refresh
            </button>
          </div>
          <CarrierGlassCard glow className="overflow-hidden p-0">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3 text-left">Load #</th>
                  <th className="px-4 py-3 text-left">Route</th>
                  <th className="px-4 py-3 text-left">Miles</th>
                  <th className="px-4 py-3 text-left">Rate</th>
                  <th className="px-4 py-3 text-left">Status</th>
                  <th className="px-4 py-3 text-left">Dispatcher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.loads.map((l) => (
                  <tr key={l.load_id}>
                    <td className="px-4 py-3 font-medium text-[var(--color-accent)]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span>{l.load_number}</span>
                        {l.db_id ? (
                          <button
                            type="button"
                            onClick={() => {
                              setDocsLoadId(l.db_id!);
                              setDocsLabel(`#${l.load_number}`);
                            }}
                            className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[var(--color-accent)]"
                          >
                            Docs
                          </button>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {l.pickup} → {l.delivery}
                    </td>
                    <td className="px-4 py-3 tabular-nums">{l.miles ?? "—"}</td>
                    <td className="px-4 py-3 text-emerald-400">{formatUsd(l.rate)}</td>
                    <td className="px-4 py-3">
                      <CarrierStatusBadge status={l.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{l.dispatcher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {data.loads.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                No assigned loads yet. When a dispatcher assigns your driver (or links your
                company), loads show up here automatically.
              </p>
            ) : null}
          </CarrierGlassCard>
        </>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierTrucksPage() {
  const { data, loading, company, refresh } = useCarrierPage();
  const [truckNumber, setTruckNumber] = useState("");
  const [equipment, setEquipment] = useState("Dry Van");
  const [vin, setVin] = useState("");
  const [plate, setPlate] = useState("");
  const [homeBase, setHomeBase] = useState("");
  const [assignDriverId, setAssignDriverId] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [fleet, setFleet] = useState<
    {
      id: string;
      truck_number: string;
      equipment: string | null;
      status: string;
      assigned_driver_profile_id: string | null;
      driver_name: string | null;
      vin?: string | null;
      license_plate?: string | null;
      home_base?: string | null;
      truck_type?: string | null;
    }[]
  >([]);

  const loadFleet = useCallback(async () => {
    try {
      const res = await fetch("/api/freight/trucks", { cache: "no-store" });
      const json = await res.json();
      if (res.ok) setFleet(json.trucks ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet, data?.trucks?.length]);

  const rolling =
    fleet.filter((t) => String(t.status || "").toLowerCase() !== "available")
      .length ||
    data?.trucks.filter((t) => t.status.toLowerCase() !== "available").length ||
    0;

  async function addTruck() {
    if (!truckNumber.trim()) {
      setMsg("Enter a truck number");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/freight/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          truckNumber: truckNumber.trim(),
          equipment: equipment.trim() || "Dry Van",
          truckType: equipment.trim() || "Dry Van",
          vin: vin.trim() || undefined,
          licensePlate: plate.trim() || undefined,
          homeBase: homeBase.trim() || undefined,
          assignedDriverProfileId: assignDriverId || null,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setTruckNumber("");
      setVin("");
      setPlate("");
      setHomeBase("");
      setAssignDriverId("");
      setMsg("Truck added.");
      await loadFleet();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function assignDriver(truckId: string, driverId: string | null) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/freight/trucks", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          truckId,
          assignedDriverProfileId: driverId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg(driverId ? "Truck assigned to driver." : "Driver unassigned.");
      await loadFleet();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeTruck(truckId: string) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/freight/trucks?truckId=${truckId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg("Truck removed.");
      await loadFleet();
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <CarrierPageShell title="Trucks & GPS" loading={loading && !data} companyName={company}>
      {data ? (
        <div className="space-y-6">
          <DispatcherFleetMap
            inTransit={rolling || data.summary.active_loads}
            totalMiles={data.summary.miles_driven}
            carriersManaged={1}
            trackingHref="/carrier/tracking"
            footerNote={`${fleet.length || data.trucks.length} trucks · ${data.drivers.length} drivers · ${rolling || data.summary.active_loads} rolling`}
          />

          <CarrierGlassCard>
            <p className="text-sm font-semibold text-[var(--color-text)]">Add truck</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Create a unit, then assign it to a driver (carrier or dispatcher can do this).
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <input
                value={truckNumber}
                onChange={(e) => setTruckNumber(e.target.value)}
                placeholder="Truck #"
                className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              />
              <input
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                placeholder="Truck type / equipment"
                className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              />
              <input
                value={vin}
                onChange={(e) => setVin(e.target.value)}
                placeholder="VIN"
                className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              />
              <input
                value={plate}
                onChange={(e) => setPlate(e.target.value)}
                placeholder="License plate"
                className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              />
              <input
                value={homeBase}
                onChange={(e) => setHomeBase(e.target.value)}
                placeholder="Home base"
                className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              />
              <select
                value={assignDriverId}
                onChange={(e) => setAssignDriverId(e.target.value)}
                className="rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              >
                <option value="">Assign later…</option>
                {data.drivers
                  .filter((d) => d.status === "Active")
                  .map((d) => (
                    <option key={d.driver_id} value={d.driver_id}>
                      {d.name}
                    </option>
                  ))}
              </select>
              <button
                type="button"
                disabled={busy}
                onClick={() => void addTruck()}
                className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50 sm:col-span-2 lg:col-span-1"
              >
                Add truck
              </button>
            </div>
            {msg ? <p className="mt-2 text-xs text-[var(--color-muted)]">{msg}</p> : null}
          </CarrierGlassCard>

          {(fleet.length ? fleet : data.trucks).length === 0 ? (
            <p className="rounded-xl border border-[var(--color-border)] px-4 py-6 text-center text-sm text-[var(--color-muted)]">
              No trucks yet. Add a truck number above and assign a driver.
            </p>
          ) : fleet.length ? (
            <div className="grid gap-4 md:grid-cols-2">
              {fleet.map((t) => (
                <CarrierGlassCard key={t.id} glow>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-lg font-bold text-[var(--color-text)]">
                        Truck #{t.truck_number}
                      </p>
                      <p className="text-sm text-[var(--color-muted)]">
                        {t.truck_type || t.equipment || "—"}
                      </p>
                      {t.vin || t.license_plate || t.home_base ? (
                        <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                          {[
                            t.license_plate ? `Plate ${t.license_plate}` : null,
                            t.vin ? `VIN ${t.vin}` : null,
                            t.home_base ? t.home_base : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      ) : null}
                    </div>
                    <CarrierStatusBadge status={t.status} />
                  </div>
                  <label className="mt-3 block text-xs text-[var(--color-muted)]">
                    Assigned driver
                    <select
                      className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-1.5 text-sm text-[var(--color-text)]"
                      value={t.assigned_driver_profile_id || ""}
                      disabled={busy}
                      onChange={(e) =>
                        void assignDriver(t.id, e.target.value || null)
                      }
                    >
                      <option value="">Unassigned</option>
                      {data.drivers.map((d) => (
                        <option key={d.driver_id} value={d.driver_id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void removeTruck(t.id)}
                    className="mt-3 text-xs text-red-300 hover:underline"
                  >
                    Remove truck
                  </button>
                </CarrierGlassCard>
              ))}
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {data.trucks.map((t) => (
                <CarrierGlassCard key={t.truck_id} glow>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-lg font-bold text-[var(--color-text)]">
                        Truck #{t.truck_number}
                      </p>
                      <p className="text-sm text-[var(--color-muted)]">{t.equipment}</p>
                    </div>
                    <CarrierStatusBadge status={t.status} />
                  </div>
                  <p className="mt-3 text-sm">
                    Driver: <strong>{t.driver}</strong>
                  </p>
                </CarrierGlassCard>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierDriversPage() {
  const ui = useUi();
  const { data, loading, company, refresh } = useCarrierPage();
  const searchParams = useSearchParams();
  const [paidMsg, setPaidMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [payEdits, setPayEdits] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [truckEdits, setTruckEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    const paid = searchParams.get("driver_paid");
    const name = searchParams.get("name");
    const email = searchParams.get("email");
    if (paid !== "1" || !name || !email) return;

    void (async () => {
      try {
        const res = await fetch("/api/freight/invite-driver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverName: name, driverEmail: email }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Invite failed");
        setPaidMsg(`Payment received — invitation sent to ${email}.`);
        await refresh();
      } catch (e) {
        setPaidMsg(e instanceof Error ? e.message : "Could not send invite after payment");
      }
    })();
  }, [searchParams, refresh]);

  async function assignTruck(driverProfileId: string, truckNumber: string) {
    setBusyId(driverProfileId);
    setMsg(null);
    try {
      const res = await fetch("/api/freight/trucks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          truckNumber: truckNumber.trim(),
          assignToDriverProfileId: driverProfileId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg(`Truck #${truckNumber.trim()} assigned.`);
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  async function manageDriver(
    driverProfileId: string,
    action: "terminate" | "suspend" | "activate" | "set_pay_percent",
    payPercent?: number,
  ) {
    setBusyId(driverProfileId);
    setMsg(null);
    try {
      const res = await fetch("/api/freight/drivers/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ driverProfileId, action, payPercent }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg(
        action === "set_pay_percent"
          ? `Driver pay set to ${payPercent}%`
          : action === "activate"
            ? "Driver revived — they can sign in again."
            : `Driver ${action}d.`,
      );
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <CarrierPageShell title="Drivers" loading={loading && !data} companyName={company}>
      {paidMsg ? (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {paidMsg}
        </p>
      ) : null}
      {msg ? (
        <p className="mb-4 rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)]">
          {msg}
        </p>
      ) : null}
      {data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-muted)]">
              Manage drivers, settle pay %, terminate/suspend, or revive access.
            </p>
            <InviteDriverModal mode="carrier" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.drivers.map((d) => (
              <CarrierGlassCard key={d.driver_id}>
                <p className="font-semibold text-[var(--color-text)]">{d.name}</p>
                <p className="text-sm text-[var(--color-muted)]">{d.phone}</p>
                <div className="mt-3 flex items-center justify-between">
                  <CarrierStatusBadge status={d.status} />
                  {d.score ? (
                    <span className="text-sm text-emerald-400">Score {d.score}</span>
                  ) : null}
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <input
                    className="min-w-0 flex-1 rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-1 text-xs"
                    placeholder="Truck #"
                    value={
                      truckEdits[d.driver_id] ??
                      (d.truck_number != null ? String(d.truck_number) : "")
                    }
                    onChange={(e) =>
                      setTruckEdits((m) => ({ ...m, [d.driver_id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busyId === d.driver_id}
                    className="shrink-0 text-xs font-semibold text-[var(--color-accent)]"
                    onClick={() => {
                      const n = (truckEdits[d.driver_id] ?? d.truck_number ?? "").trim();
                      if (!n) {
                        setMsg("Enter a truck number");
                        return;
                      }
                      void assignTruck(d.driver_id, n);
                    }}
                  >
                    Assign
                  </button>
                </div>
                {d.truck_number ? (
                  <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                    Current unit: #{d.truck_number}
                  </p>
                ) : null}
                <div className="mt-3 flex items-center gap-2">
                  <input
                    className="w-16 rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-1 text-xs"
                    placeholder="Pay %"
                    value={payEdits[d.driver_id] ?? ""}
                    onChange={(e) =>
                      setPayEdits((m) => ({ ...m, [d.driver_id]: e.target.value }))
                    }
                  />
                  <button
                    type="button"
                    disabled={busyId === d.driver_id}
                    className="text-xs text-[var(--color-accent)]"
                    onClick={() => {
                      const n = Number(payEdits[d.driver_id]);
                      if (!(n >= 0 && n <= 100)) {
                        setMsg("Enter pay % between 0 and 100");
                        return;
                      }
                      void manageDriver(d.driver_id, "set_pay_percent", n);
                    }}
                  >
                    Save %
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {String(d.status || "").toLowerCase() === "terminated" ||
                  String(d.status || "").toLowerCase() === "suspended" ? (
                    <button
                      type="button"
                      disabled={busyId === d.driver_id}
                      onClick={() => {
                        void (async () => {
                          const ok = await ui.confirm({
                            title: `Revive ${d.name}?`,
                            message: "Restore portal access so they can sign in again.",
                            confirmLabel: "Revive",
                          });
                          if (ok) void manageDriver(d.driver_id, "activate");
                        })();
                      }}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold text-emerald-200"
                    >
                      Revive
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={busyId === d.driver_id}
                        onClick={() => {
                          void (async () => {
                            const ok = await ui.confirm({
                              title: `Terminate ${d.name}?`,
                              message: "They will lose portal access.",
                              confirmLabel: "Terminate",
                              danger: true,
                            });
                            if (ok) void manageDriver(d.driver_id, "terminate");
                          })();
                        }}
                        className="rounded-lg border border-red-500/30 px-2 py-1 text-[10px] text-red-300"
                      >
                        Terminate
                      </button>
                      <button
                        type="button"
                        disabled={busyId === d.driver_id}
                        onClick={() => {
                          void (async () => {
                            const ok = await ui.confirm({
                              title: `Suspend ${d.name}?`,
                              message:
                                "They will be unable to use the driver portal until reactivated.",
                              confirmLabel: "Suspend",
                              danger: true,
                            });
                            if (ok) void manageDriver(d.driver_id, "suspend");
                          })();
                        }}
                        className="rounded-lg border border-orange-500/30 px-2 py-1 text-[10px] text-orange-300"
                      >
                        Suspend
                      </button>
                    </>
                  )}
                </div>
              </CarrierGlassCard>
            ))}
          </div>
          <CarrierGlassCard>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Pending invitations</h2>
            <div className="mt-4">
              <DriverInvitationList />
            </div>
          </CarrierGlassCard>
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierPaymentsPage() {
  const { data, loading, company } = useCarrierPage();

  return (
    <CarrierPageShell title="Payments" loading={loading && !data} companyName={company}>
      <CarrierGlassCard glow className="mb-6">
        <p className="text-sm font-semibold text-[var(--color-text)]">Carrier portal subscription</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          $10/month after a <strong className="text-[var(--color-text)]">7-day free trial</strong>, unless dispatch grants you free access.
          Contact dispatch to arrange payment via Zelle or bank transfer after your trial ends.
        </p>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Email{" "}
          <a href="mailto:support@freight.alphasolutions.software" className="text-[var(--color-accent)] hover:underline">
            support@freight.alphasolutions.software
          </a>{" "}
          to continue portal access after trial.
        </p>
      </CarrierGlassCard>
      {data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <CarrierGlassCard glow>
            <p className="text-xs uppercase text-[var(--color-muted)]">Paid this month</p>
            <p className="mt-2 text-3xl font-bold text-emerald-400">
              {formatUsd(data.payments.paid_this_month)}
            </p>
          </CarrierGlassCard>
          <CarrierGlassCard glow>
            <p className="text-xs uppercase text-[var(--color-muted)]">Unpaid invoices</p>
            <p className="mt-2 text-3xl font-bold text-orange-300">
              {formatUsd(data.payments.unpaid_invoices)}
            </p>
          </CarrierGlassCard>
          <CarrierGlassCard>
            <p className="text-xs uppercase text-[var(--color-muted)]">YTD earnings</p>
            <p className="mt-2 text-3xl font-bold">{formatUsd(data.payments.total_earnings_ytd)}</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Factoring: {data.payments.factoring_status}
            </p>
          </CarrierGlassCard>
          <CarrierGlassCard className="md:col-span-2 lg:col-span-3">
            <p className="text-sm text-[var(--color-muted)]">
              Fuel expense this month:{" "}
              <strong className="text-[var(--color-text)]">
                {formatUsd(data.fuel_expense_month)}
              </strong>
            </p>
          </CarrierGlassCard>
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierInvoicesPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Invoices" loading={loading && !data} companyName={company}>
      {data ? (
        <CarrierGlassCard>
          <p className="text-sm text-[var(--color-muted)]">
            Download dispatch fee invoices from Alpha Freight Network.
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-4">
              <div>
                <p className="font-medium">Outstanding balance</p>
                <p className="text-2xl font-bold text-orange-300">
                  {formatUsd(data.payments.unpaid_invoices)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
              >
                Download invoice PDF
              </button>
            </div>
          </div>
        </CarrierGlassCard>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierDocumentsPage() {
  const { data, loading, company } = useCarrierPage();
  const [onboarding, setOnboarding] = useState<{
    preference: string | null;
    documents: Array<{
      type: string;
      label: string;
      status: string;
      rejection_reason: string | null;
      uploaded_at: string | null;
      viewUrl: string | null;
    }>;
  } | null>(null);
  const [onboardingErr, setOnboardingErr] = useState<string | null>(null);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  async function loadOnboarding() {
    setOnboardingErr(null);
    try {
      const res = await fetch("/api/freight/carrier/documents");
      const json = await res.json();
      if (!res.ok) {
        setOnboardingErr(json.error ?? "Could not load documents");
        return;
      }
      setOnboarding(json);
    } catch {
      setOnboardingErr("Could not load documents");
    }
  }

  useEffect(() => {
    void loadOnboarding();
  }, []);

  async function reupload(type: string, file: File) {
    setUploadingType(type);
    setOnboardingErr(null);
    try {
      const fd = new FormData();
      fd.append("documentType", type);
      fd.append("file", file);
      const res = await fetch("/api/freight/carrier/documents", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await loadOnboarding();
    } catch (e) {
      setOnboardingErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  return (
    <CarrierPageShell title="Documents" loading={loading && !data} companyName={company}>
      <div className="space-y-6">
        <CarrierGlassCard>
          <h2 className="font-semibold text-[var(--color-text)]">
            Onboarding documents
          </h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            MC authority, W-9, COI, and your pay document. Re-upload if rejected.
          </p>
          {onboardingErr ? (
            <p className="mt-2 text-sm text-red-200">{onboardingErr}</p>
          ) : null}
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(onboarding?.documents ?? []).map((doc) => (
              <div
                key={doc.type}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-[var(--color-text)]">{doc.label}</p>
                  <CarrierStatusBadge status={doc.status} />
                </div>
                {doc.rejection_reason ? (
                  <p className="mt-2 text-xs text-red-200">{doc.rejection_reason}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  {doc.viewUrl ? (
                    <a
                      href={doc.viewUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-[var(--color-accent)] underline"
                    >
                      View
                    </a>
                  ) : null}
                  {doc.status === "rejected" || doc.status === "missing" ? (
                    <label className="text-xs text-[var(--color-muted)]">
                      {uploadingType === doc.type ? "Uploading…" : "Re-upload"}
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        disabled={uploadingType === doc.type}
                        className="mt-1 block w-full text-xs"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void reupload(doc.type, f);
                        }}
                      />
                    </label>
                  ) : null}
                </div>
              </div>
            ))}
            {!onboarding && !onboardingErr ? (
              <p className="text-sm text-[var(--color-muted)]">Loading onboarding docs…</p>
            ) : null}
          </div>
        </CarrierGlassCard>

        {data ? (
          <>
            <CarrierGlassCard glow className="border-dashed">
              <div className="flex flex-col items-center py-10 text-center">
                <Upload className="h-10 w-10 text-[var(--color-accent)]" />
                <p className="mt-3 font-medium text-[var(--color-text)]">Drag & drop POD / BOL</p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">PDF, JPG up to 10MB</p>
                <button
                  type="button"
                  className="mt-4 rounded-xl border border-[var(--color-accent)]/50 px-4 py-2 text-sm text-[var(--color-accent)]"
                >
                  Choose files
                </button>
              </div>
            </CarrierGlassCard>
            <div className="grid gap-3 sm:grid-cols-2">
              {data.documents.map((doc) => (
                <CarrierGlassCard key={doc.document_type}>
                  <p className="font-medium">{doc.document_type}</p>
                  <p className="text-sm text-[var(--color-muted)]">Expires {doc.expiration_date}</p>
                  <CarrierStatusBadge status={doc.status} />
                </CarrierGlassCard>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </CarrierPageShell>
  );
}

export function CarrierCompliancePage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Compliance" loading={loading && !data} companyName={company}>
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Insurance", data.compliance.insurance_status, data.compliance.insurance_expiry],
            ["MC Authority", data.compliance.mc_authority, data.compliance.mc_expiry],
            ["CDL", "Active", data.compliance.cdl_expiry],
            ["Registration", "Active", data.compliance.registration_expiry],
            ["IFTA filing", "Due", data.compliance.ifta_due],
          ].map(([label, status, expiry]) => (
            <CarrierGlassCard key={String(label)}>
              <p className="font-semibold text-[var(--color-text)]">{label}</p>
              <div className="mt-2 flex items-center justify-between">
                <CarrierStatusBadge status={String(status)} />
                <span className="text-sm text-[var(--color-muted)]">{expiry}</span>
              </div>
            </CarrierGlassCard>
          ))}
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export { CarrierChatPage } from "@/components/freight/CarrierChatPage";

export function CarrierSettingsPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Settings" loading={loading && !data} companyName={company}>
      {data ? (
        <CarrierGlassCard className="max-w-xl">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Company</dt>
              <dd className="font-medium">{data.carrier.company_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">MC</dt>
              <dd>{data.carrier.mc_number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">DOT</dt>
              <dd>{data.carrier.dot_number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Owner</dt>
              <dd>{data.carrier.owner}</dd>
            </div>
          </dl>
        </CarrierGlassCard>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierAiLoadsPanel() {
  const { data } = useCarrierPage();
  if (!data?.ai_load_recommendations.length) return null;
  return (
    <CarrierGlassCard glow className="mt-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
        <Sparkles className="h-4 w-4" />
        AI load recommendations
      </p>
      {data.ai_load_recommendations.map((l) => (
        <div key={l.load_id} className="mt-3 flex justify-between text-sm">
          <span>
            {l.pickup} → {l.delivery}
          </span>
          <span className="text-emerald-400">{formatUsd(l.rate)}</span>
        </div>
      ))}
    </CarrierGlassCard>
  );
}
