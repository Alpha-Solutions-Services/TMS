"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, MapPin, Navigation, Plus, RefreshCw, Route, Trash2, X } from "lucide-react";
import { normalizeZipList } from "@/lib/freight/zip-utils";

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
  pickupZips?: string[];
  deliveryZips?: string[];
};

type SessionRow = {
  id: string;
  loadId: string;
  loadNumber: string;
  driverId: string;
  driverName: string;
  company: string;
  lane: string;
  stops: { seq: number; kind: "pickup" | "delivery"; zip: string; lat?: number | null; lng?: number | null }[];
  location: { lat: number; lng: number; updatedAt: string } | null;
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
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [pickupZips, setPickupZips] = useState<string[]>([""]);
  const [deliveryZips, setDeliveryZips] = useState<string[]>([""]);
  const [route, setRoute] = useState<[number, number][]>([]);
  const [markers, setMarkers] = useState<
    { lat: number; lng: number; label: string; kind: "pickup" | "delivery" | "driver" }[]
  >([]);
  const [driverPos, setDriverPos] = useState<{
    lat: number;
    lng: number;
    updatedAt: string;
  } | null>(null);
  const [routeMeta, setRouteMeta] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const selected = useMemo(
    () => drivers.find((d) => `${d.driverId}:${d.loadId}` === selectedKey) ?? null,
    [drivers, selectedKey],
  );

  const refresh = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    try {
      const [locRes, sessRes] = await Promise.all([
        fetch("/api/freight/driver/location", { cache: "no-store" }),
        fetch("/api/freight/tracking/sessions", { cache: "no-store" }),
      ]);
      const locJson = await locRes.json();
      const sessJson = await sessRes.json();
      if (!locRes.ok) throw new Error(locJson.error ?? "Failed");
      setDrivers((locJson.drivers ?? []) as DriverRow[]);
      if (sessRes.ok) setSessions((sessJson.sessions ?? []) as SessionRow[]);
      setErr(null);
    } catch (e) {
      if (!soft) setErr(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (!soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
    const t = setInterval(() => void refresh(true), 12000);
    return () => clearInterval(t);
  }, [refresh]);

  // Prefill ZIPs when selecting a driver/load
  useEffect(() => {
    if (!selected) return;
    const pu = selected.pickupZips?.length ? selected.pickupZips : [""];
    const del = selected.deliveryZips?.length ? selected.deliveryZips : [""];
    setPickupZips(pu);
    setDeliveryZips(del);
    if (selected.lat && selected.lng) {
      setDriverPos({
        lat: selected.lat,
        lng: selected.lng,
        updatedAt: selected.updatedAt || new Date().toISOString(),
      });
    }
  }, [selected]);

  // Live driver pin from active session
  useEffect(() => {
    if (!selected) return;
    const sess = sessions.find(
      (s) => s.driverId === selected.driverId && s.loadId === selected.loadId,
    );
    if (sess?.location) {
      setDriverPos({
        lat: sess.location.lat,
        lng: sess.location.lng,
        updatedAt: sess.location.updatedAt,
      });
    }
  }, [sessions, selected]);

  async function geocode(zip: string) {
    const res = await fetch("/api/freight/geo/zip", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ zip }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error ?? `ZIP ${zip} failed`);
    return { lat: json.lat as number, lng: json.lng as number, zip };
  }

  async function drawRoute() {
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const puList = normalizeZipList(pickupZips);
      const delList = normalizeZipList(deliveryZips);
      if (!puList.length && !delList.length) {
        throw new Error("Enter at least one pickup or delivery ZIP");
      }
      const geos = await Promise.all(
        [...puList.map((z) => ({ z, kind: "pickup" as const })), ...delList.map((z) => ({ z, kind: "delivery" as const }))].map(
          async ({ z, kind }) => ({ ...(await geocode(z)), kind }),
        ),
      );

      const nextMarkers: {
        lat: number;
        lng: number;
        label: string;
        kind: "pickup" | "delivery" | "driver";
      }[] = geos.map((g) => ({
        lat: g.lat,
        lng: g.lng,
        label: `${g.kind === "pickup" ? "Pickup" : "Delivery"} ${g.zip}`,
        kind: g.kind,
      }));
      if (driverPos) {
        nextMarkers.push({
          lat: driverPos.lat,
          lng: driverPos.lng,
          label: selected ? `${selected.driverName} · ${minutesAgo(driverPos.updatedAt)}` : "Driver",
          kind: "driver",
        });
      }
      setMarkers(nextMarkers);

      // Road route through every stop in order (PU… then DEL…) — never a straight line
      if (geos.length >= 2) {
        const res = await fetch("/api/freight/geo/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            waypoints: geos.map((g) => ({ lat: g.lat, lng: g.lng })),
          }),
        });
        const json = (await res.json()) as {
          error?: string;
          coordinates?: [number, number][];
          distanceMiles?: number | null;
          durationMin?: number | null;
          pointCount?: number;
        };
        if (!res.ok || !json.coordinates || json.coordinates.length < 3) {
          setRoute([]);
          setRouteMeta(null);
          throw new Error(
            json.error ??
              "Could not build a road route. Check ZIPs and try Draw route again.",
          );
        }
        setRoute(json.coordinates);
        const miles =
          json.distanceMiles != null ? `${json.distanceMiles} mi` : null;
        const mins =
          json.durationMin != null ? `~${json.durationMin} min drive` : null;
        setRouteMeta(
          [
            `${puList.length} PU · ${delList.length} DEL`,
            miles,
            mins,
            "road route",
          ]
            .filter(Boolean)
            .join(" · "),
        );
      } else {
        setRoute([]);
        setRouteMeta("Single stop — add more ZIPs for a route");
      }
      setMsg("Route updated on map.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not draw route");
    } finally {
      setBusy(false);
    }
  }

  async function assignTracking() {
    if (!selected) {
      setErr("Select a driver / load first");
      return;
    }
    setBusy(true);
    setMsg(null);
    setErr(null);
    try {
      const res = await fetch("/api/freight/tracking/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadId: selected.loadId,
          driverId: selected.driverId,
          pickupZips: normalizeZipList(pickupZips),
          deliveryZips: normalizeZipList(deliveryZips),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not assign tracking");

      const stops = (json.stops ?? []) as {
        kind: "pickup" | "delivery";
        zip: string;
        lat?: number | null;
        lng?: number | null;
      }[];
      const mapped = stops
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({
          lat: s.lat as number,
          lng: s.lng as number,
          label: `${s.kind === "pickup" ? "Pickup" : "Delivery"} ${s.zip}`,
          kind: s.kind,
        }));
      setMarkers((m) => {
        const driverMarker = m.find((x) => x.kind === "driver");
        return driverMarker ? [...mapped, driverMarker] : mapped;
      });
      if (mapped.length >= 2) {
        setRoute(mapped.map((x) => [x.lat, x.lng] as [number, number]));
      }
      setMsg(
        "Tracking assigned — driver will send live location updates (push/email wake sent).",
      );
      await refresh(true);
      // Keep requesting live location briefly
      void fetch("/api/freight/driver/location/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          driverId: selected.driverId,
          loadId: selected.loadId,
        }),
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Assign failed");
    } finally {
      setBusy(false);
    }
  }

  // Keep driver marker in markers when position updates
  useEffect(() => {
    if (!driverPos) return;
    setMarkers((prev) => {
      const others = prev.filter((m) => m.kind !== "driver");
      return [
        ...others,
        {
          lat: driverPos.lat,
          lng: driverPos.lng,
          label: selected
            ? `${selected.driverName} · ${minutesAgo(driverPos.updatedAt)}`
            : "Driver",
          kind: "driver" as const,
        },
      ];
    });
  }, [driverPos, selected]);

  function ZipListEditor({
    label,
    values,
    onChange,
  }: {
    label: string;
    values: string[];
    onChange: (v: string[]) => void;
  }) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
            {label}
          </p>
          <button
            type="button"
            onClick={() => onChange([...values, ""])}
            className="inline-flex items-center gap-1 text-[10px] text-[var(--color-accent)]"
          >
            <Plus className="h-3 w-3" /> Add stop
          </button>
        </div>
        {values.map((z, i) => (
          <div key={`${label}-${i}`} className="flex gap-1">
            <input
              value={z}
              onChange={(e) => {
                const next = [...values];
                next[i] = e.target.value;
                onChange(next);
              }}
              placeholder="12345"
              className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm text-[var(--color-text)]"
            />
            {values.length > 1 ? (
              <button
                type="button"
                aria-label="Remove"
                onClick={() => onChange(values.filter((_, j) => j !== i))}
                className="rounded-lg border border-[var(--color-border)] px-2 text-[var(--color-muted)]"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>
        ))}
      </div>
    );
  }

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
            Enter multi-stop pickup &amp; delivery ZIPs, assign tracking to a driver, and
            receive live GPS updates. AI fills ZIPs when you paste a load.
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
            <p className="text-xs font-semibold text-[var(--color-text)]">
              Drivers on loads
            </p>
            {loading && drivers.length === 0 ? (
              <p className="mt-3 flex items-center gap-2 text-xs text-[var(--color-muted)]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
              </p>
            ) : drivers.length === 0 ? (
              <p className="mt-3 text-xs text-[var(--color-muted)]">
                Assign a driver to a load first.
              </p>
            ) : (
              <ul className="mt-2 max-h-56 space-y-1 overflow-y-auto">
                {drivers.map((d) => {
                  const key = `${d.driverId}:${d.loadId}`;
                  const active = selectedKey === key;
                  const live = sessions.some(
                    (s) => s.driverId === d.driverId && s.loadId === d.loadId,
                  );
                  return (
                    <li key={key}>
                      <button
                        type="button"
                        onClick={() => setSelectedKey(key)}
                        className={`w-full rounded-xl px-3 py-2 text-left text-sm ${
                          active
                            ? "bg-[var(--color-accent)]/20 text-[var(--color-text)] ring-1 ring-[var(--color-accent)]/40"
                            : "text-[var(--color-muted)] hover:bg-white/5"
                        }`}
                      >
                        <p className="font-medium text-[var(--color-text)]">
                          {d.driverName}
                          {live ? (
                            <span className="ml-2 text-[10px] text-emerald-300">LIVE</span>
                          ) : null}
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

          <div className="space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3">
            <p className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text)]">
              <Route className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              Multi-stop ZIPs
            </p>
            <ZipListEditor label="Pickup ZIPs" values={pickupZips} onChange={setPickupZips} />
            <ZipListEditor
              label="Delivery ZIPs"
              values={deliveryZips}
              onChange={setDeliveryZips}
            />
            <button
              type="button"
              disabled={busy}
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
              disabled={busy || !selected}
              onClick={() => void assignTracking()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/50 bg-emerald-500/15 px-3 py-2.5 text-sm font-semibold text-emerald-200 disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Navigation className="h-4 w-4" />}
              Assign tracking + get live updates
            </button>
          </div>

          {sessions.length > 0 ? (
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3">
              <p className="text-xs font-semibold text-[var(--color-text)]">Active tracking</p>
              <ul className="mt-2 space-y-2">
                {sessions.map((s) => (
                  <li
                    key={s.id}
                    className="rounded-lg border border-[var(--color-border)] px-2 py-2 text-[11px] text-[var(--color-muted)]"
                  >
                    <p className="font-medium text-[var(--color-text)]">
                      {s.driverName} · #{s.loadNumber || "—"}
                    </p>
                    <p>
                      {s.stops.filter((x) => x.kind === "pickup").length} PU ·{" "}
                      {s.stops.filter((x) => x.kind === "delivery").length} DEL
                      {s.location
                        ? ` · GPS ${minutesAgo(s.location.updatedAt)}`
                        : " · waiting for GPS"}
                    </p>
                    <button
                      type="button"
                      className="mt-1 inline-flex items-center gap-1 text-[10px] text-red-300"
                      onClick={() => {
                        void (async () => {
                          await fetch("/api/freight/tracking/sessions", {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              sessionId: s.id,
                              status: "completed",
                            }),
                          });
                          await refresh(true);
                        })();
                      }}
                    >
                      <X className="h-3 w-3" /> End tracking
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </aside>

        <div className="min-w-0 space-y-2">
          <UsaTrackingMap
            route={route}
            markers={markers}
            className="h-[min(70vh,560px)] w-full rounded-2xl border border-[var(--color-border)]"
          />
          <div className="flex flex-wrap gap-3 text-[10px] text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Pickup
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-amber-500" /> Delivery
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Driver (live)
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
