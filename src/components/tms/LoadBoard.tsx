"use client";

import { useState } from "react";
import { Truck, Plus } from "lucide-react";
import type { LoadRecord } from "@/lib/tms/loads";
import { loadStatusLabel } from "@/lib/tms/loads";

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA",
  "KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ",
  "NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT",
  "VA","WA","WV","WI","WY",
];

export function LoadBoard({
  loads,
  isSuper,
  onRefresh,
}: {
  loads: LoadRecord[];
  isSuper: boolean;
  onRefresh: () => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({
    origin_city: "",
    origin_state: "TX",
    destination_city: "",
    destination_state: "CA",
    pickup_date: "",
    delivery_date: "",
    equipment_type: "Dry Van",
    weight_lbs: "",
    rate: "",
    notes: "",
  });

  async function bookLoad(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/loads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          weight_lbs: form.weight_lbs ? Number(form.weight_lbs) : null,
          rate: form.rate ? Number(form.rate) : null,
          pickup_date: form.pickup_date || null,
          delivery_date: form.delivery_date || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to book load");
      setMsg(
        data.pendingApproval
          ? "Load submitted — awaiting super dispatcher approval."
          : "Load booked successfully."
      );
      setShowForm(false);
      onRefresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Load Board</h1>
          <p className="text-sm text-[var(--color-muted)]">
            {isSuper
              ? "Book, manage, and approve loads"
              : "Book loads — edits require super dispatcher approval"}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#05080f]"
        >
          <Plus className="h-4 w-4" />
          Book Load
        </button>
      </div>

      {msg ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {msg}
        </p>
      ) : null}

      {showForm ? (
        <form
          onSubmit={(e) => void bookLoad(e)}
          className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:grid-cols-2"
        >
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Origin city</span>
            <input
              required
              value={form.origin_city}
              onChange={(e) => setForm({ ...form, origin_city: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Origin state</span>
            <select
              value={form.origin_state}
              onChange={(e) => setForm({ ...form, origin_state: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            >
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Destination city</span>
            <input
              required
              value={form.destination_city}
              onChange={(e) => setForm({ ...form, destination_city: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Destination state</span>
            <select
              value={form.destination_state}
              onChange={(e) => setForm({ ...form, destination_state: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            >
              {US_STATES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Pickup date</span>
            <input
              type="date"
              value={form.pickup_date}
              onChange={(e) => setForm({ ...form, pickup_date: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Delivery date</span>
            <input
              type="date"
              value={form.delivery_date}
              onChange={(e) => setForm({ ...form, delivery_date: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Equipment</span>
            <input
              value={form.equipment_type}
              onChange={(e) => setForm({ ...form, equipment_type: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Rate ($)</span>
            <input
              type="number"
              value={form.rate}
              onChange={(e) => setForm({ ...form, rate: e.target.value })}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-sm md:col-span-2">
            <span className="text-[var(--color-muted)]">Notes</span>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
            />
          </label>
          <div className="flex gap-3 md:col-span-2">
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[var(--color-accent)] px-6 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              {busy ? "Booking…" : "Submit Load"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded-xl border border-[var(--color-border)] px-6 py-2.5 text-sm text-[var(--color-text)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Load #</th>
              <th className="px-4 py-3 font-medium">Lane</th>
              <th className="px-4 py-3 font-medium">Equipment</th>
              <th className="px-4 py-3 font-medium">Rate</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {loads.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-muted)]">
                  <Truck className="mx-auto mb-2 h-8 w-8 opacity-40" />
                  No loads yet — book your first load.
                </td>
              </tr>
            ) : (
              loads.map((load) => (
                <tr
                  key={load.id}
                  className="border-b border-[var(--color-border)]/50 hover:bg-[var(--color-surface)]/50"
                >
                  <td className="px-4 py-3 font-mono text-[var(--color-accent-2)]">
                    {load.load_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {load.origin_city}, {load.origin_state} → {load.destination_city},{" "}
                    {load.destination_state}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {load.equipment_type ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-text)]">
                    {load.rate ? `$${load.rate}` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-[var(--color-accent-dim)] px-2.5 py-0.5 text-xs text-[var(--color-accent-2)]">
                      {loadStatusLabel(load.status)}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
