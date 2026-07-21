import clsx from "clsx";
import type { ReactNode } from "react";

export function CarrierGlassCard({
  children,
  className,
  glow,
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
}) {
  return (
    <div
      className={clsx(
        "rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 backdrop-blur-md sm:p-5",
        glow && "shadow-[0_0_24px_rgba(56,163,255,0.12)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function CarrierKpiCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  accent?: "green" | "orange" | "default";
}) {
  return (
    <CarrierGlassCard glow className="min-w-[140px] flex-1">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)] sm:text-xs">
          {label}
        </p>
        <span className="text-[var(--color-accent)]">{icon}</span>
      </div>
      <p
        className={clsx(
          "mt-2 text-xl font-bold tabular-nums sm:text-2xl",
          accent === "green" && "text-emerald-400",
          accent === "orange" && "text-orange-300",
          !accent || accent === "default" ? "text-[var(--color-text)]" : "",
        )}
      >
        {value}
      </p>
    </CarrierGlassCard>
  );
}

export function CarrierStatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  const tone =
    s.includes("transit") || s.includes("driving") || s.includes("loaded")
      ? "bg-[var(--color-accent)]/20 text-[var(--color-accent)]"
      : s.includes("available") || s.includes("valid") || s.includes("approved")
        ? "bg-emerald-500/15 text-emerald-300"
        : s.includes("assigned") || s.includes("booked")
          ? "bg-sky-500/15 text-sky-300"
          : "bg-white/5 text-[var(--color-muted)]";

  return (
    <span className={clsx("rounded-full px-2.5 py-0.5 text-xs font-medium", tone)}>
      {status}
    </span>
  );
}
