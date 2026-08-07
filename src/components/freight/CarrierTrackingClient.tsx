"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";
import { useCarrierDashboard } from "@/components/freight/useCarrierDashboard";

const UsaTrackingMap = dynamic(
  () =>
    import("@/components/freight/UsaTrackingMap").then((m) => m.UsaTrackingMap),
  { ssr: false },
);

type SessionRow = {
  id: string;
  loadNumber: string;
  driverName: string;
  lane: string;
  stops: { kind: "pickup" | "delivery"; zip: string; lat?: number | null; lng?: number | null }[];
  location: { lat: number; lng: number; updatedAt: string } | null;
};

export function CarrierTrackingClient() {
  const { data } = useCarrierDashboard();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/freight/tracking/sessions", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const list = (json.sessions ?? []) as SessionRow[];
      setSessions(list);
      if (!selectedId && list[0]) setSelectedId(list[0].id);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void refresh();
    const t = setInterval(() => void refresh(), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  const selected = sessions.find((s) => s.id === selectedId) ?? sessions[0] ?? null;

  const { route, markers } = useMemo(() => {
    type M = {
      lat: number;
      lng: number;
      label: string;
      kind: "pickup" | "delivery" | "driver";
    };
    if (!selected) return { route: [] as [number, number][], markers: [] as M[] };
    const mapped: M[] = selected.stops
      .filter((s) => s.lat != null && s.lng != null)
      .map((s) => ({
        lat: s.lat as number,
        lng: s.lng as number,
        label: `${s.kind === "pickup" ? "Pickup" : "Delivery"} ${s.zip}`,
        kind: s.kind,
      }));
    if (selected.location) {
      mapped.push({
        lat: selected.location.lat,
        lng: selected.location.lng,
        label: `${selected.driverName} (live)`,
        kind: "driver",
      });
    }
    const routeLine =
      mapped.length >= 2
        ? mapped
            .filter((m) => m.kind !== "driver")
            .map((m) => [m.lat, m.lng] as [number, number])
        : [];
    return { route: routeLine, markers: mapped };
  }, [selected]);

  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar
        title="Live tracking"
        companyName={data?.carrier.company_name ?? "Carrier"}
      />
      <div className="space-y-4 p-4 sm:p-6 lg:p-8">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-[var(--color-muted)]">
            See loads your drivers are tracking for dispatch — live GPS updates appear here.
          </p>
          <button
            type="button"
            onClick={() => void refresh()}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </button>
        </div>
        {err ? <p className="text-sm text-red-300">{err}</p> : null}

        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <ul className="space-y-2">
            {sessions.length === 0 && !loading ? (
              <li className="rounded-xl border border-[var(--color-border)] px-3 py-4 text-sm text-[var(--color-muted)]">
                No active tracking yet. When dispatch assigns tracking to your driver, it shows here.
              </li>
            ) : null}
            {loading && sessions.length === 0 ? (
              <li className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </li>
            ) : null}
            {sessions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setSelectedId(s.id)}
                  className={`w-full rounded-xl border px-3 py-2 text-left text-sm ${
                    selected?.id === s.id
                      ? "border-[var(--color-accent)]/50 bg-[var(--color-accent)]/10"
                      : "border-[var(--color-border)]"
                  }`}
                >
                  <p className="font-medium text-[var(--color-text)]">
                    Load #{s.loadNumber || "—"}
                  </p>
                  <p className="text-xs text-[var(--color-muted)]">
                    {s.driverName}
                    {s.location ? " · live GPS" : " · waiting"}
                  </p>
                </button>
              </li>
            ))}
          </ul>
          <UsaTrackingMap
            route={route}
            markers={markers}
            className="h-[min(65vh,520px)] w-full rounded-2xl border border-[var(--color-border)]"
          />
        </div>
      </div>
    </div>
  );
}
