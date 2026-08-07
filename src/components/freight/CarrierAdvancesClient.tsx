"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";

type Advance = {
  id: string;
  request_type: string;
  amount: number;
  status: string;
  carrier_note: string | null;
  dispatcher_note: string | null;
  created_at: string;
};

export function CarrierAdvancesClient() {
  const [rows, setRows] = useState<Advance[]>([]);
  const [requestType, setRequestType] = useState<"lumper" | "advance">("lumper");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/carrier/advances", { cache: "no-store" });
    const json = await res.json();
    if (res.ok) setRows((json.advances ?? []) as Advance[]);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setErr("Could not load requests"));
  }, [refresh]);

  async function submit() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/carrier/advances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestType,
          amount: Number(amount),
          carrierNote: note.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setAmount("");
      setNote("");
      setMsg("Request submitted.");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar title="Lumper / Advances" />
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <p className="text-sm text-[var(--color-muted)]">
          Request a lumper or cash advance. Dispatch reviews and updates status
          manually — no automated payout in this phase.
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 space-y-3">
          <label className="block text-xs text-[var(--color-muted)]">
            Type
            <select
              value={requestType}
              onChange={(e) =>
                setRequestType(e.target.value as "lumper" | "advance")
              }
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
            >
              <option value="lumper">Lumper</option>
              <option value="advance">Advance</option>
            </select>
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            Amount (USD)
            <input
              type="number"
              min={1}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            Note
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
            />
          </label>
          <button
            type="button"
            disabled={busy || !(Number(amount) > 0)}
            onClick={() => void submit()}
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
            Submit request
          </button>
          {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
          {err ? <p className="text-xs text-red-300">{err}</p> : null}
        </div>

        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-xl border border-[var(--color-border)] px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium capitalize text-[var(--color-text)]">
                  {r.request_type} · ${Number(r.amount).toFixed(2)}
                </p>
                <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                  {r.status}
                </span>
              </div>
              {r.carrier_note ? (
                <p className="mt-1 text-xs text-[var(--color-muted)]">{r.carrier_note}</p>
              ) : null}
              {r.dispatcher_note ? (
                <p className="mt-1 text-xs text-emerald-300/90">
                  Dispatch: {r.dispatcher_note}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
