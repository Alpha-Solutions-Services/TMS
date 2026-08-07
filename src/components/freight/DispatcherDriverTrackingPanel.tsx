"use client";

import { useCallback, useEffect, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";

type Loc = {
  driverId: string;
  driverName: string;
  carrierName: string;
  loadNumber: string | null;
  lat: number;
  lng: number;
  updatedAt: string;
};

function minutesAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

/** Live driver GPS pings for dispatcher dashboard. */
export function DispatcherDriverTrackingPanel() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/freight/driver/location", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setLocations((json.locations ?? []) as Loc[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 60000);
    return () => clearInterval(t);
  }, [refresh]);

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Driver tracking</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh()}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Latest GPS pings from drivers (last 24h). Drivers tap Share location / Ping GPS on My loads.
      </p>

      {err ? <p className="mt-3 text-xs text-red-300">{err}</p> : null}

      {locations.length === 0 && !loading ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">No live driver locations yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {locations.map((l) => (
            <li
              key={l.driverId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <div>
                <p className="font-medium text-[var(--color-text)]">{l.driverName}</p>
                <p className="text-xs text-[var(--color-muted)]">
                  {l.carrierName}
                  {l.loadNumber ? ` · Load #${l.loadNumber}` : ""} · {minutesAgo(l.updatedAt)}
                </p>
              </div>
              <a
                href={`https://www.google.com/maps?q=${l.lat},${l.lng}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-[var(--color-accent)]"
              >
                {l.lat.toFixed(4)}, {l.lng.toFixed(4)} → Map
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
