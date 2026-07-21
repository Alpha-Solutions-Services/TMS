import Link from "next/link";
import clsx from "clsx";
import type { InvoiceAgingReport } from "@/lib/freight/dispatch-reports";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

const BUCKET_TONE: Record<string, string> = {
  current: "text-emerald-300",
  "1_30": "text-amber-300",
  "31_60": "text-orange-300",
  "61_90": "text-red-300",
  "90_plus": "text-red-400",
};

type Props = {
  aging: InvoiceAgingReport;
  compact?: boolean;
  className?: string;
};

export function InvoiceAgingPanel({ aging, compact, className }: Props) {
  const maxAmount = Math.max(...aging.buckets.map((b) => b.amount), 1);

  return (
    <div
      className={clsx(
        "rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Invoice aging</h3>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">
            Open sent invoices by days past due
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold tabular-nums text-orange-300">
            {formatUsd(aging.totalOpenAmount)}
          </p>
          <p className="text-xs text-[var(--color-muted)]">{aging.totalOpen} open</p>
        </div>
      </div>

      <ul className={clsx("mt-4 space-y-3", compact && "space-y-2")}>
        {aging.buckets.map((bucket) => {
          const width = Math.max(4, Math.round((bucket.amount / maxAmount) * 100));
          return (
            <li key={bucket.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-xs">
                <span className={clsx("font-medium", BUCKET_TONE[bucket.id])}>
                  {bucket.label}
                </span>
                <span className="tabular-nums text-[var(--color-muted)]">
                  {bucket.count} · {formatUsd(bucket.amount)}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-[var(--color-bg)]/80">
                <div
                  className="h-full rounded-full bg-[var(--color-accent)]/70"
                  style={{ width: `${bucket.amount > 0 ? width : 0}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {!compact ? (
        <Link
          href="/dispatcher/invoices?tab=sent"
          className="mt-4 inline-block text-xs text-[var(--color-accent)] hover:underline"
        >
          Manage sent invoices →
        </Link>
      ) : (
        <Link
          href="/dispatcher/reports"
          className="mt-3 inline-block text-xs text-[var(--color-accent)] hover:underline"
        >
          Full MIS reports →
        </Link>
      )}
    </div>
  );
}
