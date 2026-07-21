"use client";

import { useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import type { LoadFormValues } from "@/components/freight/LoadFormModal";

export function LoadPasteParser({
  onApply,
}: {
  onApply: (fields: Partial<LoadFormValues>, summary: string) => void;
}) {
  const [raw, setRaw] = useState("");
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function parse() {
    if (!raw.trim()) return;
    setBusy(true);
    setError(null);
    setSummary(null);
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
      onApply(json.fields ?? {}, json.carrierSummary ?? "");
      setSummary(json.carrierSummary ?? "Load parsed — review fields below.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not parse");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4 rounded-xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-dim)]/30 p-4">
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
        <Sparkles className="h-4 w-4" />
        Paste from load board (AI)
      </div>
      <p className="mb-2 text-[11px] text-[var(--color-muted)]">
        Paste raw text like: $1,300 · $1.04/mi · 1245 · Minneapolis, MN → Odessa, TX · 7/20 · SB · 165 lbs · 16 ft Full
      </p>
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        rows={3}
        placeholder="Paste load board line here…"
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
          Parse for carrier
        </button>
        {summary ? <span className="text-xs text-emerald-400">{summary}</span> : null}
        {error ? <span className="text-xs text-red-300">{error}</span> : null}
      </div>
    </div>
  );
}
