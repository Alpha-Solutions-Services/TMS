"use client";

import { useCallback, useEffect, useState } from "react";
import { Download, FileText, Loader2, Upload, X } from "lucide-react";
import { useUi } from "@/components/ui/UiProvider";

type DocType = "rate_con" | "bol" | "commodity" | "pod";

type DocRow = {
  type: DocType;
  label: string;
  uploaded: boolean;
  url: string | null;
};

export function LoadDocumentsPanel({
  loadId,
  loadLabel,
  onClose,
}: {
  loadId: string;
  loadLabel?: string;
  onClose: () => void;
}) {
  const ui = useUi();
  const [docs, setDocs] = useState<DocRow[]>([]);
  const [canUpload, setCanUpload] = useState<DocType[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [title, setTitle] = useState(loadLabel || "");

  const refresh = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(
        `/api/freight/loads/documents?loadId=${encodeURIComponent(loadId)}`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as {
        error?: string;
        loadNumber?: string;
        documents?: DocRow[];
        canUpload?: DocType[];
      };
      if (!res.ok) throw new Error(json.error ?? "Failed to load documents");
      setDocs(json.documents ?? []);
      setCanUpload(json.canUpload ?? []);
      if (json.loadNumber) setTitle(`#${json.loadNumber}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }, [loadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function upload(type: DocType, file: File) {
    setUploading(type);
    setErr(null);
    try {
      const form = new FormData();
      form.set("loadId", loadId);
      form.set("type", type);
      form.set("file", file);
      const res = await fetch("/api/freight/loads/documents", {
        method: "POST",
        body: form,
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      ui.toast({ kind: "success", title: "Uploaded", message: `${type} saved` });
      await refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Upload failed";
      setErr(message);
      ui.toast({ kind: "error", title: "Upload failed", message });
    } finally {
      setUploading(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-xl">
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="absolute right-3 top-3 rounded-lg p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="flex items-center gap-2 pr-8">
          <FileText className="h-5 w-5 text-[var(--color-accent)]" />
          <div>
            <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">
              Load documents
            </p>
            <h3 className="text-lg font-bold text-[var(--color-text)]">
              {title || "Docs"} · BOL · Commodity · POD
            </h3>
          </div>
        </div>

        {err ? (
          <p className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200">
            {err}
          </p>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-[var(--color-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading documents…
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {docs.map((doc) => {
              const allowUp = canUpload.includes(doc.type);
              return (
                <li
                  key={doc.type}
                  className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{doc.label}</p>
                      <p className="text-[10px] text-[var(--color-muted)]">
                        {doc.uploaded ? "Uploaded" : "Not uploaded yet"}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {doc.url ? (
                        <a
                          href={doc.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-accent)]/40 px-2.5 py-1.5 text-xs font-semibold text-[var(--color-accent)]"
                        >
                          <Download className="h-3.5 w-3.5" />
                          View
                        </a>
                      ) : null}
                      {allowUp ? (
                        <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]">
                          {uploading === doc.type ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Upload className="h-3.5 w-3.5" />
                          )}
                          {doc.uploaded ? "Replace" : "Upload"}
                          <input
                            type="file"
                            accept=".pdf,image/*"
                            className="hidden"
                            disabled={uploading === doc.type}
                            onChange={(e) => {
                              const f = e.target.files?.[0];
                              if (f) void upload(doc.type, f);
                              e.target.value = "";
                            }}
                          />
                        </label>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
