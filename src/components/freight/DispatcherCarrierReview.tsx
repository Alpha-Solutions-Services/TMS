"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Carrier = {
  id: string;
  full_name: string | null;
  company_name: string | null;
  mc_number: string | null;
  email: string | null;
  created_at: string;
  fmcsa_verified: boolean | null;
};

function CarrierRow({
  carrier,
  onChanged,
}: {
  carrier: Carrier;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/freight/dispatcher/carrier-application", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrierProfileId: carrier.id,
          decision,
          reason:
            decision === "reject"
              ? reason || "Applicant notified — insufficient documentation."
              : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unable to update carrier");
      onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-5">
      {err ? <p className="mb-4 text-xs text-red-100">{err}</p> : null}
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">
            {carrier.company_name || carrier.full_name}
          </p>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            MC #{carrier.mc_number ?? "?"}{" "}
            · {(carrier.fmcsa_verified ?? false) ? "FMCSA auto-check" : "Manual"}
          </p>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {(carrier.full_name ?? "Contact") + " · "}{carrier.email ?? "—"}
          </p>
          <p className="mt-2 text-[10px] uppercase text-[var(--color-muted)]">
            Created {new Date(carrier.created_at).toLocaleString()}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => act("approve")}
          className="h-fit rounded-lg bg-emerald-400 px-5 py-2 text-[11px] font-bold uppercase text-[#052210]"
        >
          Approve
        </button>
      </div>
      <label className="mt-6 block text-[11px] text-[var(--color-muted)]">
        Rejection note (included in outbound email if you reject this carrier)
      </label>
      <textarea
        className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-xs"
        rows={3}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => act("reject")}
        className="mt-4 rounded-lg border border-red-500/35 bg-red-500/15 px-4 py-2 text-[11px] font-bold uppercase text-red-100"
      >
        Reject
      </button>
    </div>
  );
}

export function DispatcherCarrierReview() {
  const [pending, setPending] = useState<Carrier[]>([]);

  async function load() {
    const sb = createClient();
    if (!sb) return;
    const { data } = await sb
      .from("profiles")
      .select(
        "id,full_name,company_name,mc_number,email,created_at,fmcsa_verified",
      )
      .eq("role", "carrier")
      .eq("carrier_status", "pending")
      .order("created_at", { ascending: true });
    setPending((data ?? []) as Carrier[]);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 px-6 py-4">
        <h2 className="text-xs font-black uppercase tracking-[0.36em] text-[var(--color-accent)]">
          Pending approvals
        </h2>
        <p className="text-[11px] text-[var(--color-muted)]">Review filings before brokers see this tenant.</p>
      </div>
      <div className="space-y-4">
        {pending.length === 0 ? (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-4 py-6 text-center text-xs text-[var(--color-muted)]">
            Clear inbox — carriers will appear instantly after MC registration succeeds.
          </p>
        ) : (
          pending.map((c) => (
            <CarrierRow key={c.id} carrier={c} onChanged={load} />
          ))
        )}
      </div>
    </section>
  );
}
