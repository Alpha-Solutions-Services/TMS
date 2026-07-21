"use client";

import type { TopBooker } from "@/lib/freight/dispatch-dashboard-types";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

export function TopBookersPanel({
  bookers,
  compact = false,
}: {
  bookers: TopBooker[];
  compact?: boolean;
}) {
  const list = compact ? bookers.slice(0, 5) : bookers;

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
      <h3 className="text-sm font-semibold text-[var(--color-text)]">
        Top load bookers
      </h3>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Ranked by loads booked this month (Booked By column)
      </p>
      <ul className="mt-4 space-y-3">
        {list.length === 0 ? (
          <li className="text-sm text-[var(--color-muted)]">
            Fill in the Booked By column on your dispatch sheet.
          </li>
        ) : (
          list.map((b, i) => (
            <li
              key={b.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2.5"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-accent-dim)] text-xs font-bold text-[var(--color-accent)]">
                  {i + 1}
                </span>
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{b.name}</p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {b.loads} load{b.loads !== 1 ? "s" : ""} · {formatUsd(b.commission)} commission
                  </p>
                </div>
              </div>
              <span className="text-sm tabular-nums text-emerald-400">{formatUsd(b.revenue)}</span>
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
