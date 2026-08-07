"use client";

import { useState } from "react";
import { Copy, Link2, FileSignature, Loader2 } from "lucide-react";

/** Create Live Share track link + rate-con e-sign for an existing load. */
export function DispatcherLoadShareActions({
  loadId,
  defaultEmail,
}: {
  loadId: string;
  defaultEmail?: string;
}) {
  const [zip, setZip] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trackUrl, setTrackUrl] = useState<string | null>(null);
  const [rcUrl, setRcUrl] = useState<string | null>(null);

  async function createTrack() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/share-links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadId, zip }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create track link");
      setTrackUrl(json.trackUrl as string);
      setMsg(`Track link created (ZIP ****${json.zipLast4}).`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function createRateCon() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/rate-confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loadId,
          sendEmail: Boolean(defaultEmail?.trim()),
          toEmail: defaultEmail?.trim() || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create rate con");
      setRcUrl(json.url as string);
      setMsg(
        defaultEmail?.trim()
          ? "Rate confirmation created and emailed."
          : "Rate confirmation created — copy link to send.",
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function copy(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Copied.");
    } catch {
      setErr("Copy failed");
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
        Share &amp; e-sign
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <label className="block text-xs text-[var(--color-muted)]">
          Delivery ZIP (for Live Share)
          <input
            value={zip}
            onChange={(e) => setZip(e.target.value)}
            className="mt-1 w-40 rounded-lg border border-[var(--color-border)] bg-[#050912] px-2 py-1.5 text-sm"
            placeholder="12345"
          />
        </label>
        <button
          type="button"
          disabled={busy || zip.replace(/\D/g, "").length < 4}
          onClick={() => void createTrack()}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
          Create track link
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void createRateCon()}
          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-text)] disabled:opacity-40"
        >
          <FileSignature className="h-3.5 w-3.5" />
          Create rate con
        </button>
      </div>

      {trackUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <code className="min-w-0 flex-1 break-all text-[var(--color-accent)]">{trackUrl}</code>
          <button type="button" onClick={() => void copy(trackUrl)} className="inline-flex items-center gap-1 text-[var(--color-muted)]">
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      ) : null}
      {rcUrl ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <code className="min-w-0 flex-1 break-all text-emerald-300">{rcUrl}</code>
          <button type="button" onClick={() => void copy(rcUrl)} className="inline-flex items-center gap-1 text-[var(--color-muted)]">
            <Copy className="h-3 w-3" /> Copy
          </button>
        </div>
      ) : null}
      {msg ? <p className="text-xs text-emerald-300">{msg}</p> : null}
      {err ? <p className="text-xs text-red-300">{err}</p> : null}
    </div>
  );
}
