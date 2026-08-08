"use client";

import { useCallback, useEffect, useState } from "react";

type DocItem = {
  id: string;
  document_type: string;
  label: string;
  status: string;
  uploaded_at: string;
  reviewed_at: string | null;
  rejection_reason: string | null;
  file_purged_at: string | null;
  filePurged: boolean;
  viewUrl: string | null;
  reviewed_by: { full_name?: string | null; email?: string | null } | null;
  uploaded_by: { full_name?: string | null; email?: string | null } | null;
  uploadedByStaff: boolean;
  canReview: boolean;
  carrier: {
    company_name: string | null;
    full_name: string | null;
    mc_number: string | null;
    email: string | null;
    carrier_status: string | null;
  } | null;
};

type StatusFilter = "pending" | "approved" | "rejected" | "all";

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
  { key: "all", label: "All" },
];

function DocRow({
  doc,
  onChanged,
  filter,
}: {
  doc: DocItem;
  onChanged: () => void;
  filter: StatusFilter;
}) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState<string | null>(null);

  async function act(decision: "approve" | "reject" | "revert") {
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
  const isPending = filter === "pending" || doc.status === "pending";
  // E2 four-eyes: hide approve/reject when the current user uploaded this doc.
  const canAct = isPending && doc.canReview;

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-6 py-5">
      {err ? <p className="mb-4 text-xs text-red-100">{err}</p> : null}
      <div className="flex flex-wrap justify-between gap-4">
        <div>
          <p className="text-sm font-bold text-[var(--color-text)]">{carrierName}</p>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[var(--color-muted)]">
            MC #{doc.carrier?.mc_number ?? "?"} · {doc.label}
            <span className="ml-2 normal-case tracking-normal">
              ({doc.status}
              {doc.carrier?.carrier_status
                ? ` · carrier ${doc.carrier.carrier_status}`
                : ""}
              )
            </span>
          </p>
          <p className="mt-3 text-xs text-[var(--color-muted)]">
            {doc.carrier?.email ?? "—"} · uploaded{" "}
            {new Date(doc.uploaded_at).toLocaleString()}
          </p>
          {doc.uploadedByStaff ? (
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              Uploaded by staff
              {doc.uploaded_by?.full_name || doc.uploaded_by?.email
                ? `: ${doc.uploaded_by.full_name || doc.uploaded_by.email}`
                : ""}
            </p>
          ) : null}
          {doc.viewUrl ? (
            <a
              href={doc.viewUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-block text-xs font-semibold text-[var(--color-accent)] underline"
            >
              View file
            </a>
          ) : doc.filePurged ? (
            <p className="mt-3 text-xs text-[var(--color-muted)]">
              File purged (7-day retention)
            </p>
          ) : null}
          {doc.reviewed_at ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              Reviewed {new Date(doc.reviewed_at).toLocaleString()}
              {doc.reviewed_by?.full_name || doc.reviewed_by?.email
                ? ` by ${doc.reviewed_by.full_name || doc.reviewed_by.email}`
                : ""}
            </p>
          ) : null}
          {doc.rejection_reason ? (
            <p className="mt-2 text-xs text-red-200">{doc.rejection_reason}</p>
          ) : null}
        </div>
        {canAct ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => void act("approve")}
            className="h-fit rounded-lg bg-emerald-400 px-5 py-2 text-[11px] font-bold uppercase text-[#052210]"
          >
            Approve
          </button>
        ) : null}
      </div>
      {isPending && !doc.canReview ? (
        <p className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-[11px] text-amber-100">
          Four-eyes: you uploaded this document. Another reviewer must approve or
          reject it.
        </p>
      ) : null}
      {canAct ? (
        <>
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
        </>
      ) : null}
      {doc.status !== "pending" ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void act("revert")}
          className="mt-4 rounded-lg border border-amber-500/35 bg-amber-500/10 px-4 py-2 text-[11px] font-bold uppercase text-amber-100"
        >
          Revert to pending
        </button>
      ) : null}
    </div>
  );
}

export function DispatcherCarrierDocumentsReview() {
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [docs, setDocs] = useState<DocItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/freight/dispatcher/carrier-documents?status=${filter}`,
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load documents");
      setDocs((json.documents ?? []) as DocItem[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-accent)]/25 bg-[var(--color-accent)]/5 px-6 py-4">
        <h2 className="text-xs font-black uppercase tracking-[0.36em] text-[var(--color-accent)]">
          Document review
        </h2>
        <p className="text-[11px] text-[var(--color-muted)]">
          Approve MC, W-9, COI, and pay docs before verifying the carrier. Super
          can revert decisions; verified carriers demote if docs fall incomplete.
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={
              filter === f.key
                ? "rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[#052210]"
                : "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-[var(--color-muted)]"
            }
          >
            {f.label}
          </button>
        ))}
      </div>
      {err ? <p className="text-xs text-red-200">{err}</p> : null}
      <div className="space-y-4">
        {loading ? (
          <p className="text-center text-xs text-[var(--color-muted)]">Loading…</p>
        ) : docs.length === 0 ? (
          <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-4 py-6 text-center text-xs text-[var(--color-muted)]">
            No {filter === "all" ? "" : `${filter} `}documents.
          </p>
        ) : (
          docs.map((d) => (
            <DocRow key={d.id} doc={d} filter={filter} onChanged={load} />
          ))
        )}
      </div>
    </section>
  );
}
