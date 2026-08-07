"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { InviteDriverModal } from "@/components/freight/InviteDriverModal";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";
import { useUi } from "@/components/ui/UiProvider";
import { createClient } from "@/lib/supabase/client";

export function DispatcherDriversManage({ canInvite = false }: { canInvite?: boolean }) {
  const ui = useUi();
  const { data, loading, refresh, canViewContacts } = useDispatchDashboard();
  const [verifiedCarriers, setVerifiedCarriers] = useState<
    { id: string; company_name: string | null; full_name: string | null }[]
  >([]);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState({
    driverName: "",
    driverEmail: "",
    driverPhone: "",
    carrierCompanyName: "",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [payEdits, setPayEdits] = useState<Record<string, string>>({});

  useEffect(() => {
    void (async () => {
      const sb = createClient();
      if (!sb) return;
      const { data: rows } = await sb
        .from("profiles")
        .select("id,company_name,full_name")
        .eq("role", "carrier")
        .eq("carrier_status", "verified")
        .order("company_name");
      setVerifiedCarriers((rows ?? []) as typeof verifiedCarriers);
    })();
  }, []);

  const carrierOptions = useMemo(() => {
    const names = new Set<string>();
    for (const c of data?.carrier_roster ?? []) {
      if (c.companyName) names.add(c.companyName);
    }
    for (const c of verifiedCarriers) {
      const n = c.company_name || c.full_name;
      if (n) names.add(n);
    }
    return Array.from(names).sort();
  }, [data, verifiedCarriers]);

  if (loading && !data) return <p className="p-8 text-[var(--color-muted)]">Loading drivers…</p>;
  if (!data) return null;

  async function addDriver() {
    if (!form.driverName.trim() || !form.carrierCompanyName.trim()) {
      setMsg("Driver name and carrier are required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    const profile = verifiedCarriers.find(
      (c) =>
        (c.company_name || c.full_name || "").toLowerCase() ===
        form.carrierCompanyName.trim().toLowerCase(),
    );
    const roster = data?.carrier_roster.find(
      (c) => c.companyName.toLowerCase() === form.carrierCompanyName.trim().toLowerCase(),
    );

    try {
      const res = await fetch("/api/dispatcher/drivers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverName: form.driverName,
          driverEmail: form.driverEmail,
          driverPhone: form.driverPhone,
          carrierCompanyName: form.carrierCompanyName,
          carrierProfileId: profile?.id,
          carrierRosterId: roster?.id.startsWith("sheet-") ? undefined : roster?.id,
          notes: form.notes,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setForm({
        driverName: "",
        driverEmail: "",
        driverPhone: "",
        carrierCompanyName: "",
        notes: "",
      });
      setFormOpen(false);
      await refresh();
      setMsg("Driver added to roster.");
    } catch (e) {
      setMsg(
        e instanceof Error
          ? e.message
          : "Could not add driver. Run dispatch-roster-schema.sql in Supabase.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function removeDriver(id: string) {
    if (id.startsWith("portal-")) {
      setMsg("Use Terminate for portal drivers.");
      return;
    }
    const ok = await ui.confirm({
      title: "Remove driver?",
      message: "Remove this driver from the roster?",
      confirmLabel: "Remove",
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/dispatcher/drivers?id=${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Delete failed");
      await refresh();
    } catch {
      setMsg("Could not remove driver.");
    } finally {
      setBusy(false);
    }
  }

  async function manageDriver(
    profileId: string,
    action: "terminate" | "suspend" | "activate" | "set_pay_percent",
    payPercent?: number,
    driverLabel?: string,
  ) {
    if (action === "terminate") {
      const ok = await ui.confirm({
        title: `Terminate ${driverLabel || "driver"}?`,
        message: "They will lose portal access.",
        confirmLabel: "Terminate",
        danger: true,
      });
      if (!ok) return;
    }
    if (action === "suspend") {
      const ok = await ui.confirm({
        title: `Suspend ${driverLabel || "driver"}?`,
        message: "They will be unable to use the driver portal until reactivated.",
        confirmLabel: "Suspend",
        danger: true,
      });
      if (!ok) return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/freight/drivers/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverProfileId: profileId,
          action,
          payPercent,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg(
        action === "set_pay_percent"
          ? `Pay set to ${payPercent}%`
          : `Driver ${action}d.`,
      );
      await refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-8">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">Drivers by carrier</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Roster entries plus portal drivers (invited under a carrier) — even if not on the
            manual roster.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canInvite ? (
            <>
              <button
                type="button"
                onClick={() => setFormOpen((o) => !o)}
                className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
              >
                <Plus className="h-4 w-4" />
                Add driver
              </button>
              <InviteDriverModal mode="dispatcher" carriers={verifiedCarriers} />
            </>
          ) : (
            <p className="text-xs text-[var(--color-muted)]">
              Only super dispatchers can invite or add drivers.
            </p>
          )}
        </div>
      </div>

      {formOpen && canInvite ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Driver name *</span>
              <input
                value={form.driverName}
                onChange={(e) => setForm((f) => ({ ...f, driverName: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Assign to carrier *</span>
              <select
                value={form.carrierCompanyName}
                onChange={(e) => setForm((f) => ({ ...f, carrierCompanyName: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <option value="">Select carrier…</option>
                {carrierOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Email</span>
              <input
                type="email"
                value={form.driverEmail}
                onChange={(e) => setForm((f) => ({ ...f, driverEmail: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Phone</span>
              <input
                value={form.driverPhone}
                onChange={(e) => setForm((f) => ({ ...f, driverPhone: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className="text-[var(--color-muted)]">Notes</span>
              <input
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              />
            </label>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addDriver()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              Save driver
            </button>
            <button type="button" onClick={() => setFormOpen(false)} className="px-4 py-2 text-sm text-[var(--color-muted)]">
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="text-sm text-[var(--color-muted)]">{msg}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Driver</th>
              {canViewContacts ? <th className="px-4 py-3">Email</th> : null}
              {canViewContacts ? <th className="px-4 py-3">Phone</th> : null}
              <th className="px-4 py-3">Carrier</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Pay %</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {data.driver_roster.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  No drivers found.
                </td>
              </tr>
            ) : (
              data.driver_roster.map((d) => {
                const profileId =
                  d.profileId ||
                  (d.id.startsWith("portal-") ? d.id.replace(/^portal-/, "") : null);
                const payKey = profileId || d.id;
                return (
                  <tr key={d.id} className="hover:bg-[var(--color-accent-dim)]/20">
                    <td className="px-4 py-3 font-medium">{d.driverName}</td>
                    {canViewContacts ? <td className="px-4 py-3">{d.driverEmail || "—"}</td> : null}
                    {canViewContacts ? <td className="px-4 py-3">{d.driverPhone || "—"}</td> : null}
                    <td className="px-4 py-3">{d.carrierCompanyName}</td>
                    <td className="px-4 py-3 text-xs uppercase text-[var(--color-muted)]">
                      {d.source === "portal" ? "portal" : "roster"}
                    </td>
                    <td className="px-4 py-3">
                      {profileId && canInvite ? (
                        <div className="flex items-center gap-1">
                          <input
                            className="w-14 rounded border border-[var(--color-border)] bg-[#050912] px-1 py-0.5 text-xs"
                            value={
                              payEdits[payKey] ??
                              (d.defaultDriverPayPercent != null
                                ? String(d.defaultDriverPayPercent)
                                : "")
                            }
                            placeholder="20"
                            onChange={(e) =>
                              setPayEdits((m) => ({ ...m, [payKey]: e.target.value }))
                            }
                          />
                          <button
                            type="button"
                            disabled={busy}
                            className="text-[10px] text-[var(--color-accent)]"
                            onClick={() => {
                              const n = Number(payEdits[payKey] ?? d.defaultDriverPayPercent);
                              if (!(n >= 0 && n <= 100)) {
                                setMsg("Pay % must be 0–100");
                                return;
                              }
                              void manageDriver(profileId, "set_pay_percent", n);
                            }}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <span className="text-[var(--color-muted)]">
                          {d.defaultDriverPayPercent != null
                            ? `${d.defaultDriverPayPercent}%`
                            : "—"}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs capitalize text-[var(--color-muted)]">
                      {d.driverStatus || "active"}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap items-center gap-1">
                        {profileId && canInvite ? (
                          <>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void manageDriver(profileId, "terminate", undefined, d.driverName)
                              }
                              className="rounded px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                            >
                              Terminate
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                void manageDriver(profileId, "suspend", undefined, d.driverName)
                              }
                              className="rounded px-2 py-1 text-[10px] text-orange-300 hover:bg-orange-500/10"
                            >
                              Suspend
                            </button>
                          </>
                        ) : null}
                        {!d.id.startsWith("portal-") && canInvite ? (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => void removeDriver(d.id)}
                            className="rounded p-1.5 text-[var(--color-muted)] hover:text-red-300"
                            title="Remove roster row"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
