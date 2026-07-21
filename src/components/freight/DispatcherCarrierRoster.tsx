"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { Plus, Trash2 } from "lucide-react";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";

const EMPTY_FORM = {
  mc: "",
  mcAge: "",
  contactName: "",
  phone: "",
  companyName: "",
  truck: "",
  email: "",
  address: "",
  dispatchReview: "",
  status: "Active",
  salesReview: "",
  salesAttention: "",
  documentLink: "",
};

export function DispatcherCarrierRoster({ showAdd = false }: { showAdd?: boolean }) {
  const { data, loading, refresh } = useDispatchDashboard();
  const [formOpen, setFormOpen] = useState(showAdd);
  const [form, setForm] = useState(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const sorted = useMemo(() => {
    if (!data?.carrier_roster) return [];
    return [...data.carrier_roster].sort(
      (a, b) => (b.loadsBooked ?? 0) - (a.loadsBooked ?? 0),
    );
  }, [data]);

  if (loading && !data) return null;
  if (!data) return null;

  async function addCarrier() {
    if (!form.companyName.trim()) {
      setMsg("Company name is required.");
      return;
    }
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/freight/dispatcher/carriers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setForm(EMPTY_FORM);
      setFormOpen(false);
      await refresh();
      setMsg("Carrier added.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not add carrier");
    } finally {
      setBusy(false);
    }
  }

  async function removeCarrier(id: string) {
    if (!id.startsWith("sheet-")) {
      if (!confirm("Remove this carrier from the dispatcher roster?")) return;
      setBusy(true);
      try {
        const res = await fetch(`/api/freight/dispatcher/carriers?id=${id}`, {
          method: "DELETE",
        });
        if (!res.ok) throw new Error("Delete failed");
        await refresh();
      } catch {
        setMsg("Could not remove carrier. Run dispatch-roster-schema.sql in Supabase if tables are missing.");
      } finally {
        setBusy(false);
      }
      return;
    }
    setMsg("Sheet carriers are edited in Google Sheets — remove them there.");
  }

  return (
    <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Carrier roster
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Google Sheet tab &quot;Carriers&quot;
            {data.sheet_meta.carrier_sheet_connected ? (
              <span className="text-emerald-400"> · connected</span>
            ) : (
              <span className="text-orange-300"> · sheet tab not found — using dispatcher entries</span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setFormOpen((o) => !o)}
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
        >
          <Plus className="h-4 w-4" />
          Add carrier
        </button>
      </div>

      {formOpen ? (
        <div className="mt-6 grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-4 sm:grid-cols-2 lg:grid-cols-3">
          {(
            [
              ["mc", "MC #"],
              ["mcAge", "MC Age"],
              ["contactName", "Name"],
              ["phone", "Number"],
              ["companyName", "Company Name *"],
              ["truck", "Truck"],
              ["email", "Email"],
              ["address", "Address"],
              ["dispatchReview", "Dispatch review"],
              ["status", "Status"],
              ["salesReview", "Sales review"],
              ["salesAttention", "Sales attention"],
              ["documentLink", "Document link (Drive)"],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block text-sm">
              <span className="text-[var(--color-muted)]">{label}</span>
              <input
                value={form[key]}
                onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/60 px-3 py-2 text-[var(--color-text)]"
              />
            </label>
          ))}
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-3">
            <button
              type="button"
              disabled={busy}
              onClick={() => void addCarrier()}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              Save carrier
            </button>
            <button
              type="button"
              onClick={() => setFormOpen(false)}
              className="rounded-lg px-4 py-2 text-sm text-[var(--color-muted)]"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {msg ? <p className="mt-4 text-sm text-[var(--color-muted)]">{msg}</p> : null}

      <div className="mt-6 overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="min-w-[1200px] text-left text-xs sm:text-sm">
          <thead className="bg-[var(--color-surface)]/80 text-[10px] uppercase text-[var(--color-muted)] sm:text-xs">
            <tr>
              <th className="px-3 py-3">MC</th>
              <th className="px-3 py-3">MC Age</th>
              <th className="px-3 py-3">Name</th>
              <th className="px-3 py-3">Number</th>
              <th className="px-3 py-3">Company</th>
              <th className="px-3 py-3">Truck</th>
              <th className="px-3 py-3">Email</th>
              <th className="px-3 py-3">Loads</th>
              <th className="px-3 py-3">Status</th>
              <th className="px-3 py-3">Dispatch review</th>
              <th className="px-3 py-3">Docs</th>
              <th className="px-3 py-3">Source</th>
              <th className="px-3 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  No carriers yet — add one above or fill the Carriers tab in Google Sheets.
                </td>
              </tr>
            ) : (
              sorted.map((c) => (
                <tr key={c.id} className="hover:bg-[var(--color-accent-dim)]/20">
                  <td className="px-3 py-2.5">{c.mc || "—"}</td>
                  <td className="px-3 py-2.5">{c.mcAge || "—"}</td>
                  <td className="px-3 py-2.5">{c.contactName || "—"}</td>
                  <td className="px-3 py-2.5">{c.phone || "—"}</td>
                  <td className="px-3 py-2.5 font-medium text-[var(--color-text)]">{c.companyName}</td>
                  <td className="px-3 py-2.5">{c.truck || "—"}</td>
                  <td className="px-3 py-2.5">{c.email || "—"}</td>
                  <td className="px-3 py-2.5 tabular-nums text-[var(--color-accent)]">
                    {c.loadsBooked ?? 0}
                  </td>
                  <td className="px-3 py-2.5">{c.status || "—"}</td>
                  <td className="px-3 py-2.5">{c.dispatchReview || "—"}</td>
                  <td className="px-3 py-2.5">
                    {c.documentLink ? (
                      <a
                        href={c.documentLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        Drive
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2.5 capitalize text-[var(--color-muted)]">{c.source}</td>
                  <td className="px-3 py-2.5">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void removeCarrier(c.id)}
                      className={clsx(
                        "rounded p-1.5 text-[var(--color-muted)] hover:text-red-300",
                        c.source === "sheet" && "opacity-40",
                      )}
                      title={c.source === "sheet" ? "Edit in Google Sheet" : "Remove carrier"}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
