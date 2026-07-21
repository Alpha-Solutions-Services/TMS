"use client";

import { useState } from "react";
import { Loader2, MapPin, Sparkles, Truck } from "lucide-react";
import type { LoadFormValues } from "@/components/freight/LoadFormModal";

export function LoadPasteParser({
  onApply,
}: {
  onApply: (fields: Partial<LoadFormValues>, summary: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{
    summary: string;
    fields: Partial<LoadFormValues>;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!raw.trim()) return;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const res = await fetch("/api/freight/ai/parse-load", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ raw }),
      });
      const json = (await res.json()) as {
        error?: string;
        fields?: Partial<LoadFormValues>;
        carrierSummary?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Parse failed");
      const fields = json.fields ?? {};
      const summary = json.carrierSummary ?? "Load parsed";
      setPreview({ summary, fields });
      onApply(fields, summary);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--color-accent)]/30 bg-gradient-to-br from-[var(--color-accent-dim)]/40 to-transparent p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
        <Sparkles className="h-4 w-4" />
        Paste from load board
      </div>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={2}
        placeholder="$400 Factoring 193 San Angelo, TX (126) Lubbock, TX 7/21 SB 275 lbs 26 ft - Full"
        className="dispatch-field w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !raw.trim()}
          onClick={() => void parse()}
          className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          Parse load
        </button>
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </div>

      {preview ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/80 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
            Parsed preview
          </p>
          <p className="mt-1 text-lg font-bold text-[var(--color-text)]">
            {preview.fields.rcInvoice ? `$${preview.fields.rcInvoice}` : "Rate TBD"}
            {preview.fields.miles ? (
              <span className="ml-2 text-sm font-normal text-[var(--color-muted)]">
                · {preview.fields.miles} mi
              </span>
            ) : null}
          </p>
          {preview.fields.loadDetails ? (
            <p className="mt-2 flex items-center gap-1.5 text-sm text-[var(--color-text)]">
              <MapPin className="h-3.5 w-3.5 text-[var(--color-accent)]" />
              {preview.fields.loadDetails}
            </p>
          ) : null}
          {preview.fields.notes ? (
            <p className="mt-2 flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
              <Truck className="h-3.5 w-3.5" />
              {preview.fields.notes}
            </p>
          ) : null}
          <p className="mt-3 text-[11px] text-emerald-400">{preview.summary}</p>
        </div>
      ) : null}
    </div>
  );
}
