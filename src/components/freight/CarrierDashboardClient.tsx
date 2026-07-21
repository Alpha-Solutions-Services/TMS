"use client";

import Link from "next/link";
import clsx from "clsx";
import {
  ArrowRight,
  DollarSign,
  FileDown,
  Gauge,
  MapPin,
  MessageSquare,
  Package,
  RefreshCw,
  Route,
  Truck,
  Upload,
  Wallet,
} from "lucide-react";
import {
  CarrierGlassCard,
  CarrierKpiCard,
  CarrierStatusBadge,
} from "@/components/freight/carrier/CarrierGlassCard";
import {
  CarrierMonthlyRevenueChart,
  CarrierRpmChart,
  CarrierWeeklyRevenueChart,
} from "@/components/freight/carrier/CarrierCharts";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";
import { useCarrierDashboard } from "@/components/freight/useCarrierDashboard";

function formatUsd(n: number, fraction = 0) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: fraction,
  }).format(n);
}

const QUICK_ACTIONS = [
  { label: "Upload POD", icon: Upload, href: "/carrier/documents?action=pod" },
  { label: "Send Location", icon: MapPin, href: "/carrier/trucks" },
  { label: "Contact Dispatcher", icon: MessageSquare, href: "/carrier/chat" },
  { label: "View Documents", icon: FileDown, href: "/carrier/documents" },
] as const;

export function CarrierDashboardClient() {
  const { data, loading, error, refresh } = useCarrierDashboard();

  if (loading && !data) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-[var(--color-muted)]">
        <RefreshCw className="mr-2 h-5 w-5 animate-spin" />
        Loading carrier portal…
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
          className="mt-4 rounded-lg border border-[var(--color-border)] px-4 py-2 text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!data) return null;

  const load = data.current_load;

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar title="Carrier Dashboard" companyName={data.carrier.company_name} />

      <div className="space-y-6 p-4 pb-12 sm:p-6 lg:p-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--color-muted)]">
            MC {data.carrier.mc_number} · DOT {data.carrier.dot_number}
            {data.data_source !== "mock" ? (
              <span className="text-emerald-400"> · Live sheet data</span>
            ) : (
              <span> · Demo analytics</span>
            )}
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
            Refresh
          </button>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
          <CarrierKpiCard
            label="Weekly Revenue"
            value={formatUsd(data.summary.weekly_revenue)}
            icon={<Wallet className="h-4 w-4" />}
            accent="green"
          />
          <CarrierKpiCard
            label="Monthly Revenue"
            value={formatUsd(data.summary.monthly_revenue)}
            icon={<DollarSign className="h-4 w-4" />}
          />
          <CarrierKpiCard
            label="Active Loads"
            value={String(data.summary.active_loads)}
            icon={<Package className="h-4 w-4" />}
          />
          <CarrierKpiCard
            label="RPM"
            value={formatUsd(data.summary.rpm, 2)}
            icon={<Gauge className="h-4 w-4" />}
            accent="green"
          />
          <CarrierKpiCard
            label="Miles Driven"
            value={data.summary.miles_driven.toLocaleString()}
            icon={<Route className="h-4 w-4" />}
          />
          <CarrierKpiCard
            label="Outstanding"
            value={formatUsd(data.summary.outstanding_invoices)}
            icon={<DollarSign className="h-4 w-4" />}
            accent="orange"
          />
        </div>

        {/* Hero + side panels */}
        <div className="grid gap-4 lg:grid-cols-12">
          <CarrierGlassCard glow className="relative overflow-hidden lg:col-span-7 xl:col-span-8">
            <div
              className="absolute inset-0 bg-cover bg-center opacity-40"
              style={{
                backgroundImage:
                  "linear-gradient(90deg, rgba(5,8,15,0.92) 0%, rgba(5,8,15,0.55) 50%, rgba(5,8,15,0.85) 100%), url('https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=1200&q=80')",
              }}
            />
            <div className="relative z-10 grid min-h-[280px] gap-4 md:grid-cols-2">
              <div className="flex flex-col justify-end p-2">
                <p className="text-xs uppercase tracking-widest text-[var(--color-accent)]">
                  Fleet overview
                </p>
                <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">
                  {data.trucks.length} trucks · {data.drivers.length} drivers
                </p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  GPS tracking · {data.trucks.filter((t) => t.status !== "Available").length} units
                  rolling
                </p>
                <Link
                  href="/carrier/trucks"
                  className="mt-4 inline-flex w-fit items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
                >
                  <Truck className="h-4 w-4" />
                  View live map
                </Link>
              </div>
              <div className="flex flex-col justify-end rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/70 p-4 backdrop-blur-sm">
                {load ? (
                  <>
                    <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                      Current load
                    </p>
                    <p className="mt-1 text-lg font-bold text-[var(--color-text)]">
                      {load.pickup}{" "}
                      <ArrowRight className="mx-1 inline h-4 w-4 text-[var(--color-accent)]" />{" "}
                      {load.delivery}
                    </p>
                    <p className="mt-2 text-2xl font-bold text-emerald-400">{formatUsd(load.rate)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <CarrierStatusBadge status={load.status} />
                      <span className="text-[var(--color-muted)]">ETA {load.eta}</span>
                    </div>
                    {load.truck_location ? (
                      <p className="mt-2 flex items-center gap-1 text-xs text-[var(--color-accent)]">
                        <MapPin className="h-3.5 w-3.5" />
                        {load.truck_location}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <p className="text-sm text-[var(--color-muted)]">No active load assigned.</p>
                )}
              </div>
            </div>
          </CarrierGlassCard>

          <div className="flex flex-col gap-4 lg:col-span-5 xl:col-span-4">
            <CarrierGlassCard glow>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Revenue this week
              </p>
              <div className="mt-2">
                <CarrierWeeklyRevenueChart data={data.revenue_weekly} />
              </div>
            </CarrierGlassCard>
            <CarrierGlassCard>
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                Payments
              </p>
              <div className="mt-3 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Outstanding</span>
                  <span className="font-semibold text-orange-300">
                    {formatUsd(data.payments.unpaid_invoices)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Paid this month</span>
                  <span className="font-semibold text-emerald-400">
                    {formatUsd(data.payments.paid_this_month)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--color-muted)]">Factoring</span>
                  <CarrierStatusBadge status={data.payments.factoring_status} />
                </div>
              </div>
            </CarrierGlassCard>
          </div>
        </div>

        {/* Analytics row */}
        <div className="grid gap-4 md:grid-cols-2">
          <CarrierGlassCard>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Monthly revenue
            </p>
            <CarrierMonthlyRevenueChart data={data.revenue_monthly} />
          </CarrierGlassCard>
          <CarrierGlassCard>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              RPM trend
            </p>
            <CarrierRpmChart data={data.rpm_trend} />
          </CarrierGlassCard>
        </div>

        {/* Load board */}
        <CarrierGlassCard glow className="overflow-hidden p-0">
          <div className="border-b border-[var(--color-border)] px-5 py-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Load board</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Load #</th>
                  <th className="px-4 py-3">Pickup</th>
                  <th className="px-4 py-3">Delivery</th>
                  <th className="px-4 py-3">Rate</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Dispatcher</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {data.loads.map((row) => (
                  <tr key={row.load_id} className="hover:bg-[var(--color-accent-dim)]/20">
                    <td className="px-4 py-3 font-medium text-[var(--color-accent)]">
                      {row.load_number}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{row.pickup}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{row.delivery}</td>
                    <td className="px-4 py-3 tabular-nums text-emerald-400">{formatUsd(row.rate)}</td>
                    <td className="px-4 py-3">
                      <CarrierStatusBadge status={row.status} />
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{row.dispatcher}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CarrierGlassCard>

        {/* Quick actions + compliance */}
        <div className="grid gap-4 lg:grid-cols-12">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:col-span-8">
            {QUICK_ACTIONS.map(({ label, icon: Icon, href }) => (
              <Link
                key={label}
                href={href}
                className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-3 py-5 text-center text-sm text-[var(--color-text)] backdrop-blur-md transition hover:border-[var(--color-accent)]/50 hover:shadow-[var(--glow-sm)]"
              >
                <Icon className="h-5 w-5 text-[var(--color-accent)]" />
                {label}
              </Link>
            ))}
          </div>
          <CarrierGlassCard className="lg:col-span-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              Compliance alerts
            </p>
            <ul className="mt-3 space-y-2 text-sm">
              <li className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)]">Insurance</span>
                <span className="text-emerald-300">{data.compliance.insurance_status}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)]">IFTA due</span>
                <span className="text-orange-300">{data.compliance.ifta_due}</span>
              </li>
              <li className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)]">Registration</span>
                <span>{data.compliance.registration_expiry}</span>
              </li>
            </ul>
            <Link
              href="/carrier/compliance"
              className="mt-4 inline-block text-xs text-[var(--color-accent)] hover:underline"
            >
              View all compliance →
            </Link>
          </CarrierGlassCard>
        </div>
      </div>
    </div>
  );
}
