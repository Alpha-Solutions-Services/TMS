"use client";

import { useState } from "react";
import { CheckCircle, XCircle, Clock } from "lucide-react";

type Approval = {
  id: string;
  action: string;
  payload: Record<string, unknown>;
  created_at: string;
  tms_loads?: {
    load_number: string;
    origin_city: string;
    origin_state: string;
    destination_city: string;
    destination_state: string;
  } | null;
};

export function ApprovalQueue({
  approvals: initial,
  onRefresh,
}: {
  approvals: Approval[];
  onRefresh: () => void;
}) {
  const [approvals, setApprovals] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);

  async function review(id: string, decision: "approved" | "rejected") {
    setBusy(id);
    try {
      const res = await fetch("/api/approvals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, decision }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error);
      }
      setApprovals((a) => a.filter((x) => x.id !== id));
      onRefresh();
    } catch {
      /* ignore */
    } finally {
      setBusy(null);
    }
  }

  if (approvals.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-6 text-center text-sm text-[var(--color-muted)]">
        <Clock className="mx-auto mb-2 h-6 w-6 opacity-40" />
        No pending approvals
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Pending Approvals</h2>
      {approvals.map((a) => (
        <div
          key={a.id}
          className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div>
            <p className="font-medium capitalize text-[var(--color-text)]">
              {a.action} — {a.tms_loads?.load_number ?? "New load"}
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              {a.tms_loads
                ? `${a.tms_loads.origin_city}, ${a.tms_loads.origin_state} → ${a.tms_loads.destination_city}, ${a.tms_loads.destination_state}`
                : JSON.stringify(a.payload).slice(0, 80)}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => void review(a.id, "approved")}
              className="flex items-center gap-1 rounded-lg bg-emerald-600/20 px-3 py-1.5 text-sm text-emerald-400 hover:bg-emerald-600/30 disabled:opacity-50"
            >
              <CheckCircle className="h-4 w-4" />
              Approve
            </button>
            <button
              type="button"
              disabled={busy === a.id}
              onClick={() => void review(a.id, "rejected")}
              className="flex items-center gap-1 rounded-lg bg-red-600/20 px-3 py-1.5 text-sm text-red-400 hover:bg-red-600/30 disabled:opacity-50"
            >
              <XCircle className="h-4 w-4" />
              Reject
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
