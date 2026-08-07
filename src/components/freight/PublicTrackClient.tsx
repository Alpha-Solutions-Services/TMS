"use client";

import Image from "next/image";
import { useState } from "react";

type TrackLoad = {
  loadNumber: string;
  status: string;
  pickup: string;
  delivery: string;
  lane: string;
  equipment: string;
  carrierName: string;
};

export function PublicTrackClient({ token }: { token: string }) {
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [load, setLoad] = useState<TrackLoad | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/freight/public/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, zip }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not look up load");
      setLoad(json.load as TrackLoad);
      setExpiresAt((json.expiresAt as string) || null);
    } catch (err) {
      setLoad(null);
      setError(err instanceof Error ? err.message : "Lookup failed");
    } finally {
      setBusy(false);
    }
  }

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
              Enter the delivery ZIP (last 4 digits are enough) to view status.
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
            <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">
              Load #{load.loadNumber || "—"}
            </p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{load.status || "—"}</p>
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-[var(--color-muted)]">Carrier</dt>
                <dd className="font-medium text-[var(--color-text)]">{load.carrierName || "—"}</dd>
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
                <dd className="font-medium text-[var(--color-text)]">{load.delivery || "—"}</dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="text-[var(--color-muted)]">Equipment</dt>
                <dd className="font-medium text-[var(--color-text)]">{load.equipment || "—"}</dd>
              </div>
            </dl>
            {expiresAt ? (
              <p className="text-xs text-[var(--color-muted)]">
                Link expires {new Date(expiresAt).toLocaleString()}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setLoad(null);
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
