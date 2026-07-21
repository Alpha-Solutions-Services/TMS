"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { InvoiceAgingPanel } from "@/components/freight/InvoiceAgingPanel";
import { PortalClock } from "@/components/freight/PortalClock";
import type { DispatcherReportsData } from "@/lib/freight/dispatch-reports";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function StatCard({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">{label}</p>
      <p className={`mt-2 text-xl font-bold tabular-nums ${tone ?? "text-[var(--color-text)]"}`}>
        {value}
      </p>
    </div>
  );
}

export function DispatcherReportsPage() {
  const [data, setData] = useState<DispatcherReportsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dispatcher/reports", { cache: "no-store" });
      const body = (await res.json()) as DispatcherReportsData & { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load reports");
      setData(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  if (loading && !data) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-[var(--color-muted)]">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Building MIS reports…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="p-8">
        <p className="text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 text-sm text-[var(--color-accent)] hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const { loads, invoices, academy, traffic } = data;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Reports
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Management snapshot — loads, invoices, academy, site traffic
          </p>
        </div>
        <div className="flex items-center gap-3">
          <PortalClock compact />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]/40 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Operations</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <StatCard label="Loads" value={String(loads.total)} />
          <StatCard label="Miles" value={loads.miles.toLocaleString()} />
          <StatCard label="Gross revenue" value={formatUsd(loads.grossRevenue)} tone="text-emerald-400" />
          <StatCard label="Commission" value={formatUsd(loads.commission)} tone="text-orange-300" />
          <StatCard
            label="Load open balance"
            value={formatUsd(loads.unpaidBalance)}
            tone="text-orange-300"
          />
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-[var(--color-text)]">Sent invoices</h2>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Sent" value={String(invoices.sentTotal)} />
          <StatCard label="Paid" value={String(invoices.paidCount)} tone="text-emerald-400" />
          <StatCard
            label="Partial / unpaid"
            value={`${invoices.partialCount} / ${invoices.unpaidCount}`}
            tone="text-orange-300"
          />
          <StatCard
            label="AR open"
            value={formatUsd(invoices.openBalance)}
            tone="text-orange-300"
          />
        </div>
        <div className="mt-3 flex flex-wrap gap-6 text-sm text-[var(--color-muted)]">
          <p>
            Billed: <strong className="text-[var(--color-text)]">{formatUsd(invoices.billedTotal)}</strong>
          </p>
          <p>
            Received:{" "}
            <strong className="text-emerald-400">{formatUsd(invoices.receivedTotal)}</strong>
          </p>
          <Link href="/dispatcher/invoices?tab=sent" className="text-[var(--color-accent)] hover:underline">
            Open sent invoices →
          </Link>
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <InvoiceAgingPanel aging={invoices.aging} />

        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Commission by month</h3>
          {loads.byMonth.length === 0 ? (
            <p className="mt-6 text-sm text-[var(--color-muted)]">No load months yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-[var(--color-border)]">
              {loads.byMonth.map((row) => (
                <li
                  key={row.monthTab}
                  className="flex items-center justify-between py-2.5 text-sm"
                >
                  <span className="text-[var(--color-text)]">{row.monthTab}</span>
                  <span className="tabular-nums text-[var(--color-muted)]">
                    {row.loads} loads ·{" "}
                    <span className="text-orange-300">{formatUsd(row.commission)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Academy payments</h3>
            <Link
              href="/dispatcher/academy"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Academy →
            </Link>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Total", value: academy.studentsTotal, tone: "text-[var(--color-text)]" },
              { label: "Paid", value: academy.paid, tone: "text-emerald-400" },
              { label: "Pending", value: academy.pending, tone: "text-amber-300" },
              { label: "Unpaid", value: academy.unpaid, tone: "text-orange-300" },
            ].map((s) => (
              <div key={s.label} className="rounded-xl border border-[var(--color-border)] p-3">
                <p className="text-xs text-[var(--color-muted)]">{s.label}</p>
                <p className={`mt-1 text-lg font-bold tabular-nums ${s.tone}`}>{s.value}</p>
              </div>
            ))}
          </div>
          {academy.refunded > 0 ? (
            <p className="mt-3 text-xs text-[var(--color-muted)]">Refunded: {academy.refunded}</p>
          ) : null}
        </div>

        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Site traffic</h3>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">page_views (marketing site)</p>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatCard label="Last 7 days" value={String(traffic.pageViewsLast7Days)} />
            <StatCard label="Last 30 days" value={String(traffic.pageViewsLast30Days)} />
          </div>
        </div>
      </div>
    </div>
  );
}
