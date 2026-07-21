"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";

export function DispatcherAlertsPage() {
  const { data, loading, error } = useDispatchDashboard();

  if (loading && !data) return <p className="p-8 text-[var(--color-muted)]">Loading alerts…</p>;
  if (error && !data) return <p className="p-8 text-red-300">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
          Alerts
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Derived from Dispatch Sheet balances, claims, and carrier onboarding
        </p>
      </div>

      <ul className="space-y-3">
        {data.alerts.map((alert) => (
          <li
            key={`${alert.type}-${alert.message}`}
            className={clsx(
              "flex items-start gap-4 rounded-2xl border px-5 py-4",
              alert.severity === "high"
                ? "border-red-500/30 bg-red-500/10"
                : alert.severity === "medium"
                  ? "border-orange-500/30 bg-orange-500/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]/40",
            )}
          >
            {alert.severity === "low" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
            ) : (
              <AlertTriangle
                className={clsx(
                  "mt-0.5 h-5 w-5",
                  alert.severity === "high" ? "text-red-400" : "text-orange-300",
                )}
              />
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                {alert.type.replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{alert.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
