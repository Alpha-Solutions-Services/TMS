"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { conusLatLngToPercent } from "@/lib/freight/usa-map-geo";

type FleetPing = {
  driverId: string;
  driverName: string;
  carrierName: string;
  loadNumber: string;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
  pingSource?: "gps" | "zip" | "none";
};

function minutesAgo(iso: string | null) {
  if (!iso) return "ZIP approx";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function DispatcherFleetMap({
  inTransit,
  totalMiles,
  carriersManaged,
}: {
  inTransit: number;
  totalMiles: number;
  carriersManaged: number;
}) {
  const [pings, setPings] = useState<FleetPing[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/freight/driver/location", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setPings((json.drivers ?? []) as FleetPing[]);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load fleet pings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 30_000);
    return () => clearInterval(t);
  }, [refresh]);

  const plotted = pings
    .map((p) => {
      if (p.lat == null || p.lng == null) return null;
      const pos = conusLatLngToPercent(p.lat, p.lng);
      if (!pos) return null;
      return { ...p, ...pos };
    })
    .filter(Boolean) as (FleetPing & { left: number; top: number })[];

  const liveCount = pings.filter((p) => p.pingSource === "gps").length;

  return (
    <div className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-[#05080f]">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4 py-3 sm:px-5">
        <div>
          <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">
            Live fleet map
          </p>
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">
            {liveCount} GPS live · {plotted.length} on map · {pings.length} assigned
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/dispatcher/driver-tracking"
            className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
          >
            Open tracking
          </Link>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
      </div>

      <div className="relative aspect-[16/9] w-full bg-[#02040a] sm:aspect-[2/1]">
        {/* Themed USA basemap (portal-matched dark network style) */}
        {/* eslint-disable-next-line @next/next/no-img-element -- static public asset map */}
        <img
          src="/usa-fleet-map.png"
          alt="United States fleet map"
          className="absolute inset-0 h-full w-full object-contain object-center opacity-95"
          draggable={false}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#05080f]/70 via-transparent to-[#05080f]/20" />

        {plotted.map((p) => {
          const isSel = selected === `${p.driverId}:${p.loadNumber}`;
          const isLive = p.pingSource === "gps";
          return (
            <button
              key={`${p.driverId}-${p.loadNumber}`}
              type="button"
              title={`${p.driverName} · #${p.loadNumber || "—"}`}
              onClick={() =>
                setSelected(isSel ? null : `${p.driverId}:${p.loadNumber}`)
              }
              className="absolute z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ left: `${p.left}%`, top: `${p.top}%` }}
            >
              <span
                className={`block h-3 w-3 rounded-full border-2 border-white shadow-[0_0_12px_rgba(56,163,255,0.9)] ${
                  isLive ? "bg-[#38a3ff]" : "bg-orange-400"
                } ${isSel ? "scale-150" : ""}`}
              />
              {isLive ? (
                <span className="absolute inset-0 animate-ping rounded-full bg-[#38a3ff]/40" />
              ) : null}
            </button>
          );
        })}

        {loading && plotted.length === 0 ? (
          <div className="absolute inset-0 flex items-center justify-center bg-[#05080f]/40">
            <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
          </div>
        ) : null}

        {err ? (
          <p className="absolute bottom-3 left-3 right-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {err}
          </p>
        ) : null}

        {selected ? (
          <div className="absolute bottom-3 left-3 right-3 z-20 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/95 px-3 py-2 text-xs backdrop-blur sm:left-auto sm:right-3 sm:w-64">
            {(() => {
              const p = plotted.find(
                (x) => `${x.driverId}:${x.loadNumber}` === selected,
              );
              if (!p) return null;
              return (
                <>
                  <p className="font-semibold text-[var(--color-text)]">{p.driverName}</p>
                  <p className="text-[var(--color-muted)]">
                    {p.carrierName} · Load #{p.loadNumber || "—"}
                  </p>
                  <p className="mt-1 text-[var(--color-accent)]">
                    {p.pingSource === "gps"
                      ? `Live GPS · ${minutesAgo(p.updatedAt)}`
                      : "Approx from load ZIP (awaiting GPS)"}
                  </p>
                </>
              );
            })()}
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--color-border)] px-4 py-2.5 text-[10px] text-[var(--color-muted)] sm:px-5">
        <span>
          <span className="mr-1 inline-block h-2 w-2 rounded-full bg-[#38a3ff]" /> Live GPS
          <span className="mx-2 inline-block h-2 w-2 rounded-full bg-orange-400" /> ZIP approx
        </span>
        <span>
          {inTransit} in transit · {totalMiles.toLocaleString()} mi board ·{" "}
          {carriersManaged} carriers
        </span>
      </div>
    </div>
  );
}
