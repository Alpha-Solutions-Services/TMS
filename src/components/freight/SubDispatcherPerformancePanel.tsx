"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Users } from "lucide-react";

type SubStat = {
  userId: string;
  email: string;
  fullName: string | null;
  loadsThisMonth: number;
  pendingApprovals: number;
  approvedThisMonth: number;
};

export function SubDispatcherPerformancePanel({ monthTab }: { monthTab?: string }) {
  const [stats, setStats] = useState<SubStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const qs = monthTab ? `?tab=${encodeURIComponent(monthTab)}` : "";
        const res = await fetch(`/api/dispatcher/sub-performance${qs}`);
        const json = (await res.json()) as { stats?: SubStat[] };
        setStats(json.stats ?? []);
      } catch {
        setStats([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [monthTab]);

  if (loading) {
    return (
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
        <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Sub-dispatcher activity…
        </p>
      </div>
    );
  }

  if (stats.length === 0) {
    return (
      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
        <p className="text-sm text-[var(--color-muted)]">No active sub-dispatchers.</p>
      </div>
    );
  }

  const totalPending = stats.reduce((s, r) => s + r.pendingApprovals, 0);

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Sub-dispatcher activity</h3>
        </div>
        {totalPending > 0 ? (
          <Link
            href="/dispatcher/approvals"
            className="text-xs font-semibold text-orange-300 hover:underline"
          >
            {totalPending} pending approval{totalPending > 1 ? "s" : ""} →
          </Link>
        ) : null}
      </div>
      <ul className="mt-4 divide-y divide-[var(--color-border)]">
        {stats.map((s) => (
          <li key={s.userId} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
            <div>
              <p className="font-medium text-[var(--color-text)]">
                {s.fullName || s.email.split("@")[0]}
              </p>
              <p className="text-xs text-[var(--color-muted)]">{s.email}</p>
            </div>
            <div className="flex gap-4 text-xs tabular-nums">
              <span title="Loads booked this month">
                <strong className="text-[var(--color-text)]">{s.loadsThisMonth}</strong> loads
              </span>
              <span title="Awaiting your approval">
                <strong className={s.pendingApprovals ? "text-orange-300" : "text-[var(--color-muted)]"}>
                  {s.pendingApprovals}
                </strong>{" "}
                pending
              </span>
              <span title="Approved this month">
                <strong className="text-emerald-400">{s.approvedThisMonth}</strong> approved
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
