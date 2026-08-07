"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type Advance = {
  id: string;
  request_type: string;
  amount: number;
  status: string;
  carrier_note: string | null;
  dispatcher_note: string | null;
  carrier_name?: string | null;
  load_number?: string | null;
  created_at: string;
};

type Referral = {
  id: string;
  code: string;
  invitee_email: string | null;
  status: string;
  reward_note: string | null;
  created_at: string;
};

export function DispatcherAdvancesPage() {
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [referrals, setReferrals] = useState<Referral[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [aRes, rRes] = await Promise.all([
      fetch("/api/dispatcher/advances", { cache: "no-store" }),
      fetch("/api/dispatcher/referrals", { cache: "no-store" }),
    ]);
    const aJson = await aRes.json();
    const rJson = await rRes.json();
    if (aRes.ok) setAdvances((aJson.advances ?? []) as Advance[]);
    if (rRes.ok) setReferrals((rJson.referrals ?? []) as Referral[]);
    if (!aRes.ok && !rRes.ok) setErr("Could not load");
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function decide(
    id: string,
    status: "approved" | "denied" | "paid",
  ) {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/dispatcher/advances", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function markReferral(id: string, status: "rewarded" | "cancelled" | "registered") {
    setBusy(true);
    try {
      const res = await fetch("/api/dispatcher/referrals", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          status,
          rewardNote: status === "rewarded" ? "Marked rewarded in TMS" : undefined,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed");
      }
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Advances & referrals
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Approve lumper/advance requests and mark referral rewards
        </p>
      </div>

      {err ? <p className="text-sm text-red-300">{err}</p> : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Advance requests
        </h2>
        <ul className="mt-3 space-y-3">
          {advances.map((a) => (
            <li
              key={a.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {a.carrier_name} · {a.request_type} · $
                    {Number(a.amount).toFixed(2)}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Status: {a.status}
                    {a.load_number ? ` · Load #${a.load_number}` : ""}
                  </p>
                  {a.carrier_note ? (
                    <p className="mt-1 text-xs text-[var(--color-muted)]">{a.carrier_note}</p>
                  ) : null}
                </div>
                {a.status === "pending" ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(a.id, "approved")}
                      className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-[#05080f] disabled:opacity-40"
                    >
                      Approve
                    </button>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void decide(a.id, "denied")}
                      className="rounded-lg border border-red-400/40 px-3 py-1.5 text-xs text-red-200 disabled:opacity-40"
                    >
                      Deny
                    </button>
                  </div>
                ) : a.status === "approved" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void decide(a.id, "paid")}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
                    Mark paid
                  </button>
                ) : null}
              </div>
            </li>
          ))}
          {!advances.length ? (
            <p className="text-sm text-[var(--color-muted)]">No advance requests.</p>
          ) : null}
        </ul>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Referrals
        </h2>
        <ul className="mt-3 space-y-3">
          {referrals.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3"
            >
              <div>
                <p className="font-mono text-sm text-[var(--color-accent)]">{r.code}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {r.invitee_email || "no email"} · {r.status}
                </p>
              </div>
              {r.status === "pending" || r.status === "registered" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markReferral(r.id, "rewarded")}
                    className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f] disabled:opacity-40"
                  >
                    Mark rewarded
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void markReferral(r.id, "cancelled")}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-40"
                  >
                    Cancel
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
