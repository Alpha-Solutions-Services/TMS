"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Link2, MapPin, RefreshCw } from "lucide-react";

type Loc = {
  driverId: string;
  driverName: string;
  carrierName: string;
  loadId: string | null;
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

/** Live driver GPS pings for dispatcher dashboard + share track links. */
export function DispatcherDriverTrackingPanel() {
  const [locations, setLocations] = useState<Loc[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [zipByLoad, setZipByLoad] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async (soft = false) => {
    if (!soft) setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/freight/driver/location", { cache: "no-store" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setLocations((json.locations ?? []) as Loc[]);
    } catch (e) {
      if (!soft) setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      if (!soft) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh(false);
    const t = setInterval(() => void refresh(true), 20000);
    const onVis = () => {
      if (document.visibilityState === "visible") void refresh(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  async function createTrackLink(loadId: string) {
    const zip = zipByLoad[loadId] || "";
    if (zip.replace(/\D/g, "").length < 4) {
      setMsg("Enter delivery ZIP (4+ digits) to create a live track link.");
      return;
    }
    setBusyId(loadId);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadId, zip }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      const url = json.trackUrl as string;
      await navigator.clipboard.writeText(url);
      setMsg(`Track link copied: ${url}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not create link");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-[var(--color-accent)]" />
          <h2 className="text-sm font-semibold text-[var(--color-text)]">Driver tracking</h2>
        </div>
        <button
          type="button"
          onClick={() => void refresh(false)}
          className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Live GPS from drivers (auto-refreshes). Create a ZIP-gated share link for
        customers — it shows status + map when the driver is pinging.
      </p>
      <p className="mt-1 text-[10px] text-[var(--color-muted)]">
        Where to look: <strong className="text-[var(--color-text)]">Dispatcher → Dashboard → Driver tracking</strong>
        {" "}· share link also from edit load → Share &amp; e-sign.
      </p>

      {err ? <p className="mt-3 text-xs text-red-300">{err}</p> : null}
      {msg ? <p className="mt-3 text-xs text-emerald-300 break-all">{msg}</p> : null}

      {locations.length === 0 && !loading ? (
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          No live driver locations yet. Ask the driver to tap Share location on My loads.
        </p>
      ) : (
        <ul className="mt-4 space-y-3">
          {locations.map((l) => (
            <li
              key={l.driverId}
              className="rounded-xl border border-[var(--color-border)] px-3 py-3 text-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
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
              </div>
              {l.loadId ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="text-[10px] text-[var(--color-muted)]">
                    Delivery ZIP
                    <input
                      value={zipByLoad[l.loadId] || ""}
                      onChange={(e) =>
                        setZipByLoad((m) => ({ ...m, [l.loadId!]: e.target.value }))
                      }
                      className="mt-0.5 w-28 rounded border border-[var(--color-border)] bg-[#050912] px-2 py-1 text-xs"
                      placeholder="12345"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={busyId === l.loadId}
                    onClick={() => void createTrackLink(l.loadId!)}
                    className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-[11px] font-semibold text-[#05080f] disabled:opacity-40"
                  >
                    <Link2 className="h-3 w-3" />
                    Copy live track link
                  </button>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-[11px] text-[var(--color-muted)]"
                    onClick={() =>
                      void navigator.clipboard.writeText(
                        `https://www.google.com/maps?q=${l.lat},${l.lng}`,
                      )
                    }
                  >
                    <Copy className="h-3 w-3" />
                    Copy map URL
                  </button>
                </div>
              ) : (
                <p className="mt-2 text-[10px] text-[var(--color-muted)]">
                  Ping was not tied to a load — open the load → Share &amp; e-sign to create a
                  customer track link.
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
