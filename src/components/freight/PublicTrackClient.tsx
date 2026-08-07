"use client";

import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { MapPin, RefreshCw } from "lucide-react";

type TrackLoad = {
  loadNumber: string;
  status: string;
  pickup: string;
  delivery: string;
  lane: string;
  equipment: string;
  carrierName: string;
};

type TrackLocation = {
  lat: number;
  lng: number;
  updatedAt: string;
};

export function PublicTrackClient({ token }: { token: string }) {
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<TrackLoad | null>(null);
  const [location, setLocation] = useState<TrackLocation | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [unlockedZip, setUnlockedZip] = useState<string | null>(null);

  const fetchTrack = useCallback(
    async (zipValue: string, soft = false) => {
      if (!soft) setBusy(true);
      setError(null);
      try {
        const res = await fetch("/api/freight/public/track", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, zip: zipValue }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Could not look up load");
        setLoad(json.load as TrackLoad);
        setLocation((json.location as TrackLocation) || null);
        setExpiresAt((json.expiresAt as string) || null);
        setUnlockedZip(zipValue);
      } catch (err) {
        if (!soft) {
          setLoad(null);
          setLocation(null);
          setError(err instanceof Error ? err.message : "Lookup failed");
        }
      } finally {
        if (!soft) setBusy(false);
      }
    },
    [token],
  );

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    await fetchTrack(zip, false);
  }

  useEffect(() => {
    if (!unlockedZip || !load) return;
    const id = window.setInterval(() => {
      void fetchTrack(unlockedZip, true);
    }, 20000);
    return () => window.clearInterval(id);
  }, [unlockedZip, load, fetchTrack]);

  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 py-10">
      <div className="mx-auto max-w-lg">
        <div className="flex items-center gap-3">
          <Image
            src="/afn-logo.png"
            alt="Alpha Freight Network"
            width={56}
            height={56}
            className="rounded-full border border-[var(--color-border)] bg-black"
            priority
          />
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
              Live share
            </p>
            <h1
              className="text-xl font-bold text-[var(--color-text)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Load tracking
            </h1>
          </div>
        </div>

        {!load ? (
          <form
            onSubmit={lookup}
            className="mt-8 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-5"
          >
            <p className="text-sm text-[var(--color-muted)]">
              Enter the delivery ZIP (last 4 digits are enough) to view status
              and live location (when the driver has shared GPS).
            </p>
            <label className="block text-xs text-[var(--color-muted)]">
              Delivery ZIP
              <input
                required
                inputMode="numeric"
                autoComplete="postal-code"
                value={zip}
                onChange={(e) => setZip(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm text-[var(--color-text)]"
                placeholder="12345"
              />
            </label>
            {error ? (
              <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            ) : null}
            <button
              type="submit"
              disabled={busy || zip.replace(/\D/g, "").length < 4}
              className="w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#05080f] disabled:opacity-40"
            >
              {busy ? "Checking…" : "View status"}
            </button>
          </form>
        ) : (
          <div className="mt-8 space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">
                  Load #{load.loadNumber || "—"}
                </p>
                <p className="text-2xl font-bold text-[var(--color-text)]">
                  {load.status || "—"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => unlockedZip && void fetchTrack(unlockedZip, false)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-xs text-[var(--color-muted)]"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
                Refresh
              </button>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--color-muted)]">Carrier</dt>
                <dd className="font-medium text-[var(--color-text)]">
                  {load.carrierName || "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Lane</dt>
                <dd className="font-medium text-[var(--color-text)]">{load.lane || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Pickup</dt>
                <dd className="font-medium text-[var(--color-text)]">{load.pickup || "—"}</dd>
              </div>
              <div>
                <dt className="text-[var(--color-muted)]">Delivery</dt>
                <dd className="font-medium text-[var(--color-text)]">
                  {load.delivery || "—"}
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--color-muted)]">Equipment</dt>
                <dd className="font-medium text-[var(--color-text)]">
                  {load.equipment || "—"}
                </dd>
              </div>
            </dl>

            {location ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-emerald-300">
                  <MapPin className="h-3.5 w-3.5" />
                  Live location
                </p>
                <p className="mt-1 text-sm text-[var(--color-text)]">
                  {location.lat.toFixed(5)}, {location.lng.toFixed(5)}
                </p>
                <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                  Updated {new Date(location.updatedAt).toLocaleString()}
                </p>
                <a
                  href={`https://www.google.com/maps?q=${location.lat},${location.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-block text-xs font-semibold text-[var(--color-accent)]"
                >
                  Open in Google Maps →
                </a>
              </div>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                No live GPS yet — driver must tap Share location / Ping GPS in
                the driver app (updates auto-refresh every 20s).
              </p>
            )}

            {expiresAt ? (
              <p className="text-xs text-[var(--color-muted)]">
                Link expires {new Date(expiresAt).toLocaleString()}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setLoad(null);
                setLocation(null);
                setUnlockedZip(null);
                setError(null);
              }}
              className="text-xs text-[var(--color-accent)] hover:underline"
            >
              Check again
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
