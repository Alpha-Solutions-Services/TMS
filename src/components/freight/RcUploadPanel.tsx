"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Sparkles } from "lucide-react";
import { createLoadFromRc } from "@/lib/freight/rc-to-load";
import { maxUploadLabelMb } from "@/lib/freight/upload-mime";

export function RcUploadPanel({
  monthTab,
  bookedBy,
  onCreated,
}: {
  monthTab: string;
  bookedBy?: string;
  onCreated: (message: string) => void | Promise<void>;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string> | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function parseFile(f: File) {
    setBusy(true);
    setMsg(null);
    setSummary(null);
    setFields(null);
    setFile(f);
    try {
      const form = new FormData();
      form.set("file", f);
      form.set("docType", "rate_con");
      const res = await fetch("/api/freight/ai/parse-document", { method: "POST", body: form });
      const json = (await res.json()) as {
        error?: string;
        carrierSummary?: string;
        fields?: Record<string, string>;
      };
      if (!res.ok) throw new Error(json.error ?? "Could not read RC");
      setSummary(json.carrierSummary ?? "RC parsed");
      setFields(json.fields ?? {});
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Parse failed");
      setFile(null);
    } finally {
      setBusy(false);
    }
  }

  async function createLoad() {
    if (!fields) return;
    setBusy(true);
    setMsg(null);
    try {
      const result = await createLoadFromRc({
        fields,
        file,
        monthTab,
        bookedBy,
      });
      if (!result.ok) throw new Error(result.error ?? "Create failed");
      setSummary(null);
      setFields(null);
      setFile(null);
      await onCreated(result.message ?? "Load created from RC.");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-accent-dim)]/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
            <Sparkles className="h-4 w-4" />
            Upload rate confirmation
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            AI reads the RC and creates the load in one click · PDF or image · max {maxUploadLabelMb()}MB
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => fileRef.current?.click()}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm font-medium text-[var(--color-text)] hover:border-[var(--color-accent)]/40 disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}
          Choose RC file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void parseFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {summary && fields ? (
        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/60 p-4">
          <p className="text-sm text-[var(--color-text)]">{summary}</p>
          <ul className="mt-2 grid gap-1 text-xs text-[var(--color-muted)] sm:grid-cols-2">
            {fields.companyName ? <li>Carrier: {fields.companyName}</li> : null}
            {fields.loadNumber ? <li>Load #: {fields.loadNumber}</li> : null}
            {fields.loadDetails ? <li>Lane: {fields.loadDetails}</li> : null}
            {fields.rcInvoice ? <li>Rate: ${fields.rcInvoice}</li> : null}
          </ul>
          <button
            type="button"
            disabled={busy}
            onClick={() => void createLoad()}
            className="mt-3 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            Create load from RC
          </button>
        </div>
      ) : null}

      {msg ? <p className="mt-3 text-xs text-red-300">{msg}</p> : null}
    </section>
  );
}
