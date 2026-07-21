"use client";

import { useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import type { DashboardLoad } from "@/lib/freight/dispatch-dashboard-types";

type SortKey = keyof Pick<DashboardLoad, "sr" | "carrier" | "broker" | "rate" | "status" | "balance">;

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n);
}

export function DispatchLoadsTable({
  loads,
  compact = false,
  onRemove,
  onAssign,
  onEdit,
}: {
  loads: DashboardLoad[];
  compact?: boolean;
  onRemove?: (dbId: string) => void | Promise<void>;
  onAssign?: (load: DashboardLoad) => void;
  onEdit?: (load: DashboardLoad) => void;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("sr");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const statuses = useMemo(() => {
    const set = new Set(loads.map((l) => l.status).filter((s) => s && s !== "—"));
    return ["all", ...Array.from(set)];
  }, [loads]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let rows = loads.filter((l) => {
      if (statusFilter !== "all" && l.status !== statusFilter) return false;
      if (!q) return true;
      return (
        l.sr.includes(q) ||
        l.carrier.toLowerCase().includes(q) ||
        l.broker.toLowerCase().includes(q) ||
        l.load_details.toLowerCase().includes(q) ||
        l.truck_trailer.toLowerCase().includes(q)
      );
    });

    rows = [...rows].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return sortDir === "asc" ? av - bv : bv - av;
      }
      return sortDir === "asc"
        ? String(av).localeCompare(String(bv))
        : String(bv).localeCompare(String(av));
    });

    return compact ? rows.slice(0, 8) : rows;
  }, [loads, query, statusFilter, sortKey, sortDir, compact]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return null;
    return sortDir === "asc" ? (
      <ArrowUp className="inline h-3 w-3" />
    ) : (
      <ArrowDown className="inline h-3 w-3" />
    );
  }

  const showActions = Boolean(onRemove || onAssign || onEdit);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-accent-dim)]/20 px-4 py-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Load board
        </p>
      </div>

      {!compact ? (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="search"
              placeholder="Search SR#, carrier, broker, truck…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="dispatch-field w-full rounded-xl border border-[var(--color-border)] py-2.5 pl-10 pr-4 text-sm outline-none focus:border-[var(--color-accent)]/50"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="dispatch-field rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
          >
            {statuses.map((s) => (
              <option key={s} value={s}>
                {s === "all" ? "All statuses" : s}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="min-w-[1400px] text-left text-xs sm:text-sm">
          <thead className="bg-[var(--color-surface)]/80 text-[10px] uppercase tracking-wider text-[var(--color-muted)] sm:text-xs">
            <tr>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <button type="button" onClick={() => toggleSort("sr")} className="hover:text-[var(--color-accent)]">
                  SR# <SortIcon col="sr" />
                </button>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Booked By</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">RC Date</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Truck & Trailer</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <button type="button" onClick={() => toggleSort("carrier")} className="hover:text-[var(--color-accent)]">
                  Company <SortIcon col="carrier" />
                </button>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <button type="button" onClick={() => toggleSort("broker")} className="hover:text-[var(--color-accent)]">
                  Broker <SortIcon col="broker" />
                </button>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Load Details</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Pickup</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Delivery</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Miles</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <button type="button" onClick={() => toggleSort("rate")} className="hover:text-[var(--color-accent)]">
                  RC-Invoice <SortIcon col="rate" />
                </button>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">%</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Dispatch Fee</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Invoice</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">Received</th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <button type="button" onClick={() => toggleSort("balance")} className="hover:text-[var(--color-accent)]">
                  Balance <SortIcon col="balance" />
                </button>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">
                <button type="button" onClick={() => toggleSort("status")} className="hover:text-[var(--color-accent)]">
                  Status <SortIcon col="status" />
                </button>
              </th>
              <th className="whitespace-nowrap px-3 py-3 font-medium">CPAY</th>
              {showActions ? (
                <th className="whitespace-nowrap px-3 py-3 font-medium">Actions</th>
              ) : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={18} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  No loads on this month&apos;s dispatch sheet.
                </td>
              </tr>
            ) : (
              filtered.map((load) => (
                <tr
                  key={`${load.load_id}-${load.sr}`}
                  className="hover:bg-[var(--color-accent-dim)]/30"
                >
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-medium text-[var(--color-text)]">
                    {load.sr}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.booked_by}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.rc_date}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.truck_trailer}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-text)]">{load.carrier}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.broker}</td>
                  <td className="max-w-[180px] truncate px-3 py-2.5 text-[var(--color-muted)]" title={load.load_details}>
                    {load.load_details}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.pickup}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.delivery}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{load.miles || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-emerald-400">
                    {formatUsd(load.rate)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{load.dispatch_percent || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-orange-300">
                    {formatUsd(load.dispatch_fee)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">{load.invoice_status}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums">{formatUsd(load.received)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 tabular-nums text-orange-300">
                    {load.balance > 0 ? formatUsd(load.balance) : "—"}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-medium sm:text-xs",
                        load.status.toLowerCase() === "unpaid"
                          ? "bg-red-500/15 text-red-300"
                          : load.status.toLowerCase().includes("transit")
                            ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                            : "bg-white/5 text-[var(--color-muted)]",
                      )}
                    >
                      {load.status}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-[var(--color-muted)]">{load.cpay}</td>
                  {showActions ? (
                    <td className="whitespace-nowrap px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {onEdit && load.db_id ? (
                          <button
                            type="button"
                            onClick={() => onEdit(load)}
                            className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-text)] hover:bg-white/5"
                          >
                            Edit
                          </button>
                        ) : null}
                        {onAssign && load.db_id ? (
                          <button
                            type="button"
                            onClick={() => onAssign(load)}
                            className="rounded-lg border border-[var(--color-accent)]/40 px-2 py-1 text-[10px] text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]/30"
                          >
                            Assign
                          </button>
                        ) : null}
                        {onRemove && load.db_id ? (
                          <button
                            type="button"
                            onClick={() => void onRemove(load.db_id!)}
                            className="rounded-lg border border-red-500/40 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/10"
                          >
                            Remove
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
