"use client";

import Link from "next/link";
import clsx from "clsx";
import {
  AlertTriangle,
  DollarSign,
  FileText,
  Package,
  RefreshCw,
  Truck,
  UserPlus,
  Wallet,
} from "lucide-react";
import { FleetDonutChart, RevenueLineChart } from "@/components/freight/DispatchCharts";
import { DispatchLoadsTable } from "@/components/freight/DispatchLoadsTable";
import { DispatchMonthSelector } from "@/components/freight/DispatchMonthSelector";
import { InvoiceAgingPanel } from "@/components/freight/InvoiceAgingPanel";
import { PortalClock } from "@/components/freight/PortalClock";
import { TopBookersPanel } from "@/components/freight/TopBookersPanel";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";
import type { SummaryCard } from "@/lib/freight/dispatch-dashboard-types";
import type { InvoiceAgingReport } from "@/lib/freight/dispatch-reports";

const ICONS: Record<string, typeof Truck> = {
  truck: Truck,
  "truck-available": Truck,
  load: Package,
  dollar: DollarSign,
  wallet: Wallet,
};

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

function SummaryCardView({ card }: { card: SummaryCard }) {
  const Icon = ICONS[card.icon] ?? Package;
  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 shadow-[var(--glow-sm)]">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
          {card.title}
        </p>
        <Icon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
      </div>
      <p
        className={clsx(
          "mt-2 text-2xl font-bold tabular-nums",
          card.highlight === "green"
            ? "text-emerald-400"
            : card.highlight === "orange"
              ? "text-orange-300"
              : "text-[var(--color-text)]",
        )}
      >
        {card.currency === "USD" ? formatUsd(card.value) : card.value}
      </p>
    </div>
  );
}

const QUICK_ICONS: Record<string, typeof UserPlus> = {
  "user-plus": UserPlus,
  truck: Truck,
  file: FileText,
  upload: UserPlus,
};

export function DispatcherDashboardClient() {
  const { data, loading, error, refresh, activeTab, changeTab } = useDispatchDashboard();

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-muted)]">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Syncing dispatch sheet…
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center">
        <p className="text-red-300">{error}</p>
        <button
          type="button"
          onClick={() => void refresh()}
          className="mt-4 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-text)]"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 p-4 pb-10 sm:p-6 lg:p-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--color-accent)]">
            {data.company.name}
          </p>
          <h1
            className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Dispatcher Dashboard
          </h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            {data.sheet_meta.workbook_name} · tab{" "}
            <strong className="text-[var(--color-text)]">{data.sheet_meta.active_tab}</strong>
            {data.sheet_meta.connected ? (
              <span className="text-emerald-400">
                {" "}
                · {data.sheet_meta.row_count} loads synced
              </span>
            ) : (
              <span className="text-orange-300"> · sheet not connected</span>
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <PortalClock compact />
          <DispatchMonthSelector
            value={activeTab}
            options={data.sheet_meta.available_tabs}
            onChange={changeTab}
            disabled={loading}
          />
          <button
            type="button"
            onClick={() => void refresh()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/60 px-4 py-2 text-sm text-[var(--color-text)] hover:border-[var(--color-accent)]/40 disabled:opacity-60"
          >
            <RefreshCw className={clsx("h-4 w-4", loading && "animate-spin")} />
            Refresh
          </button>
        </div>
      </header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {data.summary_cards.map((card) => (
          <SummaryCardView key={card.title} card={card} />
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="relative overflow-hidden rounded-3xl border border-[var(--color-border)] bg-gradient-to-br from-[var(--color-surface)] to-[var(--color-bg)] lg:col-span-2">
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30"
            style={{
              backgroundImage:
                "linear-gradient(135deg, rgba(5,8,15,0.85), rgba(11,17,32,0.95)), url('https://i.pinimg.com/736x/c5/61/37/c56137a6d3def2f28cbb3f218ceb33ce.jpg')",
            }}
          />
          <div className="relative flex min-h-[220px] flex-col justify-end p-6 sm:min-h-[280px] sm:p-8">
            <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">
              Operations
            </p>
            <h2 className="mt-2 text-xl font-bold text-[var(--color-text)]">
              Fleet on the road — {data.fleet_overview.in_transit} in transit
            </h2>
            <p className="mt-2 max-w-lg text-sm text-[var(--color-muted)]">
              {data.footer_stats.total_miles.toLocaleString()} total miles on the dispatch board ·{" "}
              {data.footer_stats.carriers_managed} carriers managed
            </p>
          </div>
        </div>

        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Alerts</h3>
          <ul className="mt-4 space-y-3">
            {data.alerts.slice(0, 4).map((alert) => (
              <li
                key={`${alert.type}-${alert.message}`}
                className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2.5"
              >
                <AlertTriangle
                  className={clsx(
                    "mt-0.5 h-4 w-4 shrink-0",
                    alert.severity === "high"
                      ? "text-red-400"
                      : alert.severity === "medium"
                        ? "text-orange-300"
                        : "text-[var(--color-muted)]",
                  )}
                  aria-hidden
                />
                <span className="text-sm text-[var(--color-text)]">{alert.message}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/dispatcher/alerts"
            className="mt-4 inline-block text-xs text-[var(--color-accent)] hover:underline"
          >
            View all alerts →
          </Link>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <TopBookersPanel bookers={data.top_bookers} compact />
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 lg:col-span-2">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Fleet overview</h3>
          <div className="mt-4">
            <FleetDonutChart fleet={data.fleet_overview} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Revenue trend</h3>
          <p className="mt-1 text-xs text-[var(--color-muted)]">This week (RC invoice)</p>
          <div className="mt-4">
            <RevenueLineChart data={data.revenue_chart.data} />
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Recent loads</h3>
            <p className="text-xs text-[var(--color-muted)]">From Dispatch Sheet</p>
          </div>
          <Link
            href="/dispatcher/loads"
            className="text-xs text-[var(--color-accent)] hover:underline"
          >
            Full load board →
          </Link>
        </div>
        <DispatchLoadsTable loads={data.loads} compact />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Outstanding invoices</h3>
            <Link
              href="/dispatcher/reports"
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Reports →
            </Link>
          </div>
          <ul className="mt-4 divide-y divide-[var(--color-border)]">
            {data.invoices
              .filter((inv) => inv.status === "Unpaid" || inv.balance > 0)
              .slice(0, 5)
              .map((inv) => (
                <li key={inv.invoice_id} className="flex items-center justify-between py-3 text-sm">
                  <div>
                    <p className="font-medium text-[var(--color-text)]">{inv.carrier}</p>
                    <p className="text-xs text-[var(--color-muted)]">Due {inv.due_date}</p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-orange-300">{formatUsd(inv.balance || inv.amount)}</p>
                    <p className="text-xs text-red-300">{inv.status}</p>
                  </div>
                </li>
              ))}
            {data.invoices.filter((inv) => inv.status === "Unpaid" || inv.balance > 0).length ===
            0 ? (
              <li className="py-6 text-center text-sm text-[var(--color-muted)]">
                No outstanding invoices
              </li>
            ) : null}
          </ul>
        </div>

        {data.invoice_aging ? (
          <InvoiceAgingPanel
            aging={data.invoice_aging as InvoiceAgingReport}
            compact
          />
        ) : (
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Quick actions</h3>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {data.quick_actions.map((action) => {
                const Icon = QUICK_ICONS[action.icon] ?? FileText;
                return (
                  <Link
                    key={action.name}
                    href={action.href}
                    className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 py-3 text-sm text-[var(--color-text)] transition hover:border-[var(--color-accent)]/40 hover:shadow-[var(--glow-sm)]"
                  >
                    <Icon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
                    {action.name}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {data.invoice_aging ? (
        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Quick actions</h3>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {data.quick_actions.map((action) => {
              const Icon = QUICK_ICONS[action.icon] ?? FileText;
              return (
                <Link
                  key={action.name}
                  href={action.href}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 py-3 text-sm text-[var(--color-text)] transition hover:border-[var(--color-accent)]/40 hover:shadow-[var(--glow-sm)]"
                >
                  <Icon className="h-4 w-4 text-[var(--color-accent)]" aria-hidden />
                  {action.name}
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-4 py-4 text-sm">
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-[var(--color-muted)]">
          <span>
            Carriers:{" "}
            <strong className="text-[var(--color-text)]">
              {data.footer_stats.carriers_managed}
            </strong>
          </span>
          <span>
            Revenue this week:{" "}
            <strong className="text-emerald-400">
              {formatUsd(data.footer_stats.revenue_this_week)}
            </strong>
          </span>
          <span>
            Commission:{" "}
            <strong className="text-orange-300">
              {formatUsd(data.footer_stats.commission_earned)}
            </strong>
          </span>
          <span>
            Unpaid:{" "}
            <strong className="text-orange-300">
              {formatUsd(data.footer_stats.unpaid_invoices)}
            </strong>
          </span>
        </div>
        <Link
          href="/dispatcher/invoices?action=generate"
          className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] hover:opacity-90"
        >
          <FileText className="h-4 w-4" />
          Generate Invoice
        </Link>
      </footer>
    </div>
  );
}
