"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Navigation, RefreshCw, Route } from "lucide-react";

const UsaTrackingMap = dynamic(
  () =>
    import("@/components/freight/UsaTrackingMap").then((m) => m.UsaTrackingMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] items-center justify-center rounded-xl border border-[var(--color-border)] text-sm text-[var(--color-muted)]">
        Loading map…
      </div>
    ),
  },
);

type DriverRow = {
  driverId: string;
  driverName: string;
  carrierName: string;
  loadId: string;
  loadNumber: string;
  lane: string;
  lat: number | null;
  lng: number | null;
  updatedAt: string | null;
};

function minutesAgo(iso: string | null) {
  if (!iso) return "no ping yet";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  return `${Math.round(mins / 60)}h ago`;
}

export function DispatcherDriverTrackingPage() {
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pickupZip, setPickupZip] = useState("");
  const [deliveryZip, setDeliveryZip] = useState("");
  const [route, setRoute] = useState<[number, number][]>([]);
  const [pickup, setPickup] = useState<{ lat: number; lng: number } | null>(null);
  const [delivery, setDelivery] = useState<{ lat: number; lng: number } | null>(
    null,
  );
  const [driverPos, setDriverPos] = useState<{
    lat: number;
    lng: number;
    updatedAt: string;
  } | null>(null);
  const [routeMeta, setRouteMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [liveBusy, setLiveBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => drivers.find((d) => `${d.driverId}:${d.loadId}` === selectedId) ?? null,
    [drivers, selectedId],
  );

  const refresh = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    try {
      const res = await fetch("/api/freight/driver/location", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const list = (json.drivers ?? []) as DriverRow[];
      setDrivers(list);
      setErr(null);
    } catch (e) {
      if (!soft) setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
    const t = setInterval(() => void refresh(true), 15000);
    return () => clearInterval(t);
  }, [refresh]);

  // Keep selected driver pin updated from roster
  useEffect(() => {
    if (!selected?.lat || !selected?.lng) return;
    setDriverPos({
      lat: selected.lat,
      lng: selected.lng,
      updatedAt: selected.updatedAt || new Date().toISOString(),
    });
  }, [selected]);

  async function geocode(zip: string) {
    const res = await fetch("/api/freight/geo/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? "ZIP lookup failed");
    return { lat: json.lat as number, lng: json.lng as number };
  }

  async function drawRoute() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const [pu, del] = await Promise.all([
        geocode(pickupZip),
        geocode(deliveryZip),
      ]);
      setPickup(pu);
      setDelivery(del);

      const res = await fetch("/api/freight/geo/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fromLat: pu.lat,
          fromLng: pu.lng,
          toLat: del.lat,
          toLng: del.lng,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Route failed");
      setRoute((json.coordinates as [number, number][]) ?? []);
      if (json.distanceMiles != null) {
        setRouteMeta(
          `${json.distanceMiles} mi · ~${json.durationMin} min drive`,
        );
      } else {
        setRouteMeta("Straight-line route (router fallback)");
      }
      setMsg("Route drawn on map.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not draw route");
    } finally {
      setBusy(false);
    }
  }

  async function getLiveLocation() {
    if (!selected) {
      setErr("Select a driver first.");
      return;
    }
    setLiveBusy(true);
    setMsg("Requesting live location from driver’s phone…");
    setErr(null);
    try {
      const res = await fetch("/api/freight/driver/location/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: selected.driverId,
          loadId: selected.loadId,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Request failed");
      const requestId = json.requestId as string;

      // Poll up to ~45s for the driver app to respond
      const started = Date.now();
      while (Date.now() - started < 45000) {
        await new Promise((r) => setTimeout(r, 2500));
        const poll = await fetch(
          `/api/freight/driver/location/request?requestId=${encodeURIComponent(requestId)}`,
          { cache: "no-store" },
        );
        const body = await poll.json();
        if (!poll.ok) continue;
        if (body.request?.status === "fulfilled" && body.location) {
          setDriverPos({
            lat: body.location.lat,
            lng: body.location.lng,
            updatedAt: body.location.updatedAt,
          });
          setMsg("Live location received from driver phone.");
          await refresh(true);
          setLiveBusy(false);
          return;
        }
        if (body.request?.status === "expired") {
          throw new Error(
            "Driver phone did not respond in time. Ask the driver to keep the driver app open (location permission on).",
          );
        }
      }
      throw new Error(
        "Still waiting — keep the driver app open on their phone, then try again.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Live location failed");
      setMsg(null);
    } finally {
      setLiveBusy(false);
    }
  }

  const markers = useMemo(() => {
    const list: {
      lat: number;
      lng: number;
      label: string;
      kind: "pickup" | "delivery" | "driver";
    }[] = [];
    if (pickup) {
      list.push({
        lat: pickup.lat,
        lng: pickup.lng,
        label: `Pickup ${pickupZip}`,
        kind: "pickup",
      });
    }
    if (delivery) {
      list.push({
        lat: delivery.lat,
        lng: delivery.lng,
        label: `Delivery ${deliveryZip}`,
        kind: "delivery",
      });
    }
    if (driverPos) {
      list.push({
        lat: driverPos.lat,
        lng: driverPos.lng,
        label: selected
          ? `${selected.driverName} · ${minutesAgo(driverPos.updatedAt)}`
          : "Driver",
        kind: "driver",
      });
    }
    return list;
  }, [pickup, delivery, driverPos, pickupZip, deliveryZip, selected]);

  return (
    <div className="space-y-4 p-4 sm:p-6 lg:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Live ops
          </p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)]">
            Driver tracking
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            Enter pickup &amp; delivery ZIP codes to draw the route on the USA map,
            then click <strong className="text-[var(--color-text)]">Get live location</strong> —
            the driver’s phone sends GPS automatically when their app is open
            (no Share button needed).
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refresh(false)}
          className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-muted)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {err ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {msg}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <aside className="space-y-3">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3">
            <p className="text-xs font-semibold text-[var(--color-text)]">Drivers on loads</p>
            {loading && drivers.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : drivers.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                No assigned active loads yet.
              </p>
            ) : (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto">
                {drivers.map((d) => {
                  const key = `${d.driverId}:${d.loadId}`;
                  const active = selectedId === key;
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(key)}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                          active
                            ? "bg-[var(--color-accent)]/20 text-[var(--color-text)] ring-1 ring-[var(--color-accent)]/40"
                            : "hover:bg-white/5 text-[var(--color-muted)]"
                        }`}
                      >
                        <p className="font-medium text-[var(--color-text)]">
                          {d.driverName}
                        </p>
                        <p className="text-[10px]">
                          Load #{d.loadNumber || "—"} · {d.carrierName}
                        </p>
                        <p className="text-[10px]">{minutesAgo(d.updatedAt)}</p>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3 space-y-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text)]">
              <Route className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              Route (ZIP codes)
            </p>
            <label className="block text-[10px] text-[var(--color-muted)]">
              Pickup ZIP
              <input
                value={pickupZip}
                onChange={(e) => setPickupZip(e.target.value)}
                placeholder="60601"
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm text-[var(--color-text)]"
              />
            </label>
            <label className="block text-[10px] text-[var(--color-muted)]">
              Delivery ZIP
              <input
                value={deliveryZip}
                onChange={(e) => setDeliveryZip(e.target.value)}
                placeholder="90210"
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm text-[var(--color-text)]"
              />
            </label>
            <button
              type="button"
              disabled={
                busy ||
                pickupZip.replace(/\D/g, "").length < 5 ||
                deliveryZip.replace(/\D/g, "").length < 5
              }
              onClick={() => void drawRoute()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-3 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}
              Draw route on map
            </button>
            {routeMeta ? (
              <p className="text-[10px] text-[var(--color-muted)]">{routeMeta}</p>
            ) : null}

            <button
              type="button"
              disabled={liveBusy || !selected}
              onClick={() => void getLiveLocation()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3 py-2.5 text-sm font-semibold text-emerald-200 disabled:opacity-40"
            >
              {liveBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Navigation className="h-4 w-4" />
              )}
              Get live location
            </button>
            <p className="text-[10px] text-[var(--color-muted)]">
            Driver must install the driver app (Add to Home Screen) and turn{" "}
            <strong className="text-[var(--color-text)]">Live tracking ON</strong>.
            Get live location wakes their phone via push/email — browsers cannot
            read GPS while fully closed.
            </p>
          </div>
        </aside>

        <div className="min-w-0 space-y-2">
          <UsaTrackingMap route={route} markers={markers} className="h-[min(70vh,560px)] w-full rounded-2xl border border-[var(--color-border)]" />
          <div className="flex flex-wrap gap-3 text-[10px] text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Pickup
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Delivery
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Driver
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
