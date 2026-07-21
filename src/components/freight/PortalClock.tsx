"use client";

import { useEffect, useState } from "react";

export function useLiveNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return now;
}

export function PortalClock({ compact = false }: { compact?: boolean }) {
  const now = useLiveNow();
  const dateStr = now.toLocaleDateString("en-US", {
    weekday: compact ? "short" : "long",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const timeStr = now.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2">
      <p className="text-[10px] uppercase tracking-wider text-[var(--color-muted)]">Live</p>
      <p className="text-xs text-[var(--color-text)]">{dateStr}</p>
      <p className="text-sm font-semibold tabular-nums text-[var(--color-accent)]">{timeStr}</p>
      {!compact ? (
        <p className="mt-0.5 truncate text-[10px] text-[var(--color-muted)]">{tz}</p>
      ) : null}
    </div>
  );
}
