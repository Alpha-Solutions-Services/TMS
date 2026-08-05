"use client";

import { useCallback, useEffect, useState } from "react";

type DocRow = {
  type: string;
  label: string;
  status: string;
  rejection_reason: string | null;
  uploaded_at: string | null;
  file_purged_at: string | null;
  viewUrl: string | null;
};

function statusClass(status: string) {
  const s = status.toLowerCase();
  if (s === "approved") return "bg-emerald-500/15 text-emerald-300";
  if (s === "rejected") return "bg-red-500/15 text-red-200";
  if (s === "pending") return "bg-amber-500/15 text-amber-200";
  return "bg-white/5 text-[var(--color-muted)]";
}

export function CarrierOnboardingDocsPanel({
  heading = "Your onboarding documents",
}: {
  heading?: string;
}) {
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingType, setUploadingType] = useState<string | null>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch("/api/freight/carrier/documents", {
        credentials: "same-origin",
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (res.status === 401) {
        throw new Error("Please log in again to view your documents.");
      }
      if (!res.ok) throw new Error(json.error ?? "Could not load documents");
      setDocs((json.documents ?? []) as DocRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load documents");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function reupload(type: string, file: File) {
    setUploadingType(type);
    setErr(null);
    try {
      const fd = new FormData();
      fd.append("documentType", type);
      fd.append("file", file);
      const res = await fetch("/api/freight/carrier/documents", {
        method: "POST",
        body: fd,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Upload failed");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploadingType(null);
    }
  }

  const needsAttention = docs.filter(
    (d) => d.status === "rejected" || d.status === "missing",
  ).length;

  return (
    <div className="mt-8 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 px-4 py-5 text-left">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">{heading}</h2>
      {needsAttention > 0 ? (
        <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
          {needsAttention} document{needsAttention === 1 ? "" : "s"} need
          {needsAttention === 1 ? "s" : ""} your attention — see reasons below and
          re-upload.
        </p>
      ) : null}
      {loading ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">Loading documents…</p>
      ) : null}
      {err ? <p className="mt-3 text-xs text-red-200">{err}</p> : null}
      <ul className="mt-4 space-y-3">
        {docs.map((doc) => (
          <li
            key={doc.type}
            className="rounded-lg border border-[var(--color-border)] px-3 py-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-medium text-[var(--color-text)]">
                {doc.label}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(doc.status)}`}
              >
                {doc.status}
              </span>
            </div>
            {doc.rejection_reason ? (
              <p className="mt-2 text-xs text-red-200">
                Reason: {doc.rejection_reason}
              </p>
            ) : null}
            {doc.status === "rejected" && !doc.viewUrl && doc.file_purged_at ? (
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                Original file removed after 7-day retention — re-upload a new
                file.
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-3">
              {doc.viewUrl ? (
                <a
                  href={doc.viewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-[var(--color-accent)] underline"
                >
                  View file
                </a>
              ) : null}
              {doc.status === "rejected" || doc.status === "missing" ? (
                <label className="text-xs text-[var(--color-muted)]">
                  {uploadingType === doc.type ? "Uploading…" : "Re-upload"}
                  <input
                    type="file"
                    accept=".pdf,image/*"
                    disabled={uploadingType === doc.type}
                    className="mt-1 block w-full max-w-xs text-xs"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void reupload(doc.type, f);
                    }}
                  />
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {!loading && docs.length === 0 && !err ? (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          No onboarding documents on file yet. If you just registered, refresh
          shortly or contact support.
        </p>
      ) : null}
    </div>
  );
}
