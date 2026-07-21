"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Loader2, X } from "lucide-react";

type ApprovalRow = {
  id: string;
  load_id: string | null;
  action: "create" | "update" | "delete";
  payload: Record<string, unknown>;
  requested_by_email: string | null;
  created_at: string;
  load?: {
    company_name?: string;
    load_number?: string;
    sr?: number;
    status?: string;
  } | null;
};

export function ApprovalsPageClient() {
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dispatcher/approvals");
      const json = (await res.json()) as { approvals?: ApprovalRow[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not load approvals");
      setRows(json.approvals ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function resolve(id: string, decision: "approved" | "rejected") {
    setBusyId(id);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Action failed");
      setMsg(decision === "approved" ? "Approved." : "Rejected.");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusyId(null);
    }
  }

  function label(row: ApprovalRow): string {
    const company =
      (row.payload.companyName as string) ||
      row.load?.company_name ||
      "—";
    const loadNo =
      (row.payload.loadNumber as string) ||
      row.load?.load_number ||
      (row.load?.sr ? `SR-${row.load.sr}` : "—");
    return `${row.action.toUpperCase()} · ${company} · ${loadNo}`;
  }

  return (
    <div className="mx-auto max-w-4xl p-6 md:p-8">
      <h1 className="text-2xl font-bold text-[var(--color-text)]">Sub-dispatcher approvals</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Review load bookings and changes submitted by sub-dispatchers before they go live.
      </p>

      {msg && (
        <p className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-text)]">
          {msg}
        </p>
      )}

      {loading ? (
        <p className="mt-8 flex items-center gap-2 text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-8 text-[var(--color-muted)]">No pending approvals.</p>
      ) : (
        <ul className="mt-6 space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--color-text)]">{label(row)}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Requested by {row.requested_by_email ?? "sub-dispatcher"} ·{" "}
                    {new Date(row.created_at).toLocaleString()}
                  </p>
                  {row.load?.status && (
                    <p className="mt-1 text-xs text-amber-400">Load status: {row.load.status}</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void resolve(row.id, "approved")}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600/20 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-600/30 disabled:opacity-50"
                  >
                    {busyId === row.id ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <Check className="h-3 w-3" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={busyId === row.id}
                    onClick={() => void resolve(row.id, "rejected")}
                    className="inline-flex items-center gap-1 rounded-lg bg-red-600/20 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-600/30 disabled:opacity-50"
                  >
                    <X className="h-3 w-3" /> Reject
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
