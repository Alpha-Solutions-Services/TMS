"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, UserPlus } from "lucide-react";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";

type Referral = {
  id: string;
  code: string;
  invitee_email: string | null;
  status: string;
  reward_note: string | null;
  shareUrl: string;
  created_at: string;
};

export function CarrierReferralsClient() {
  const [rows, setRows] = useState<Referral[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/carrier/referrals", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setRows((json.referrals ?? []) as Referral[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function create() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/carrier/referrals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inviteeEmail: email.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setEmail("");
      setMsg(`Code ${json.referral.code} created.`);
      await refresh();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar title="Referrals" />
      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">
        <p className="text-sm text-[var(--color-muted)]">
          Share a code with another carrier. Rewards are marked manually by
          Alpha Freight when the invitee is onboarded.
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
          <label className="block text-xs text-[var(--color-muted)]">
            Invitee email (optional)
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              placeholder="carrier@email.com"
            />
          </label>
          <button
            type="button"
            disabled={busy}
            onClick={() => void create()}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
            Create referral code
          </button>
          {msg ? <p className="mt-2 text-xs text-emerald-300">{msg}</p> : null}
          {err ? <p className="mt-2 text-xs text-red-300">{err}</p> : null}
        </div>

        {loading ? (
          <p className="text-sm text-[var(--color-muted)]">Loading…</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((r) => (
              <li
                key={r.id}
                className="rounded-xl border border-[var(--color-border)] px-4 py-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-sm text-[var(--color-accent)]">{r.code}</p>
                  <span className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                    {r.status}
                  </span>
                </div>
                {r.invitee_email ? (
                  <p className="mt-1 text-xs text-[var(--color-muted)]">{r.invitee_email}</p>
                ) : null}
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                  onClick={() => void navigator.clipboard.writeText(r.shareUrl)}
                >
                  <Copy className="h-3 w-3" /> Copy share link
                </button>
              </li>
            ))}
            {!rows.length ? (
              <p className="text-sm text-[var(--color-muted)]">No referrals yet.</p>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
