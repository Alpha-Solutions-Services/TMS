"use client";

import { useCallback, useEffect, useState } from "react";

type DocItem = {
  id: string;
  document_type: string;
  label: string;
  status: string;
  uploaded_at: string;
  rejection_reason: string | null;
  viewUrl: string | null;
  carrier: {
    company_name: string | null;
    full_name: string | null;
    mc_number: string | null;
    email: string | null;
    carrier_status: string | null;
  } | null;
};

function DocRow({
  doc,
  onChanged,
}: {
  doc: DocItem;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: "approve" | "reject") {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/freight/dispatcher/carrier-documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          documentId: doc.id,
          decision,
          reason: decision === "reject" ? reason : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Unable to update document");
      onChanged();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const carrierName =
    doc.carrier?.company_name || doc.carrier?.full_name || "Carrier";

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-5">
      {err ? <p className="mb-4 text-xs text-red-100">{err}</p> : null}
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">{carrierName}</p>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            MC #{doc.carrier?.mc_number ?? "?"} · {doc.label}
          </p>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {doc.carrier?.email ?? "—"} · uploaded{" "}
            {new Date(doc.uploaded_at).toLocaleString()}
          </p>
          {doc.viewUrl ? (
            <a
              href={doc.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-[var(--color-accent)] underline"
            >
              View file
            </a>
          ) : null}
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("approve")}
          className="h-fit rounded-lg bg-emerald-400 px-5 py-2 text-[11px] font-bold uppercase text-[#052210]"
        >
          Approve
        </button>
      </div>
      <label className="mt-6 block text-[11px] text-[var(--color-muted)]">
        Rejection note (required to reject)
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
        onClick={() => void act("reject")}
        className="mt-4 rounded-lg border border-red-500/35 bg-red-500/15 px-4 py-2 text-[11px] font-bold uppercase text-red-100"
      >
        Reject
      </button>
    </div>
  );
}

export function DispatcherCarrierDocumentsReview() {
  const [pending, setPending] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        "/api/freight/dispatcher/carrier-documents?status=pending",
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load documents");
      setPending((json.documents ?? []) as DocItem[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 px-6 py-4">
        <h2 className="text-xs font-black uppercase tracking-[0.36em] text-[var(--color-accent)]">
          Pending document review
        </h2>
        <p className="text-[11px] text-[var(--color-muted)]">
          Approve MC, W-9, COI, and pay docs before verifying the carrier.
        </p>
      </div>
      {err ? <p className="text-xs text-red-200">{err}</p> : null}
      <div className="space-y-4">
        {loading ? (
          <p className="text-center text-xs text-[var(--color-muted)]">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-4 py-6 text-center text-xs text-[var(--color-muted)]">
            No pending documents.
          </p>
        ) : (
          pending.map((d) => (
            <DocRow key={d.id} doc={d} onChanged={load} />
          ))
        )}
      </div>
    </section>
  );
}
