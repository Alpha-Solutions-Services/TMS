"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  FileText,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import type { PortalFile } from "@/lib/sanity/portal-data";
import { useUiOptional } from "@/components/ui/UiProvider";

type UploadedFile = {
  id: string;
  file_name: string;
  storage_path: string;
  mime_type?: string | null;
  size_bytes?: number | null;
  created_at: string;
  note?: string | null;
};

function formatBytes(n?: number | null) {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function FileLibrary({
  files: sanityFiles,
}: {
  files: PortalFile[];
  onUploadClick?: () => void;
}) {
  const ui = useUiOptional();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploads, setUploads] = useState<UploadedFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/files");
      const j = (await res.json()) as { files?: UploadedFile[] };
      setUploads(j.files ?? []);
    } catch {
      setUploads([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onPick(fileList: FileList | null) {
    const file = fileList?.[0];
    if (!file) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/files", { method: "POST", body: fd });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Upload failed");
      ui?.toast({
        kind: "success",
        title: "File uploaded",
        message: file.name,
      });
      await load();
    } catch (e) {
      ui?.toast({
        kind: "error",
        title: "Upload failed",
        message: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remove(id: string, name: string) {
    const ok = ui
      ? await ui.confirm({
          title: "Delete file?",
          message: `Remove “${name}” from your portal library.`,
          confirmLabel: "Delete",
          danger: true,
        })
      : window.confirm(`Delete ${name}?`);
    if (!ok) return;
    const res = await fetch(`/api/files/${id}`, { method: "DELETE" });
    if (!res.ok) {
      ui?.toast({ kind: "error", title: "Could not delete file" });
      return;
    }
    ui?.toast({ kind: "success", title: "File deleted" });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30">
        <div className="flex flex-col gap-4 border-b border-[var(--color-border)] p-4 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <h2
              className="flex items-center gap-2 text-xl font-bold text-[var(--color-text)]"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              <FileText
                className="h-5 w-5 text-[var(--color-accent)]"
                aria-hidden
              />
              Project files
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Upload briefs, contracts, and assets. Images, PDF, Word, Excel up
              to 15MB.
            </p>
          </div>
          <div>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.xls,.xlsx,.txt,.csv,image/*"
              onChange={(e) => void onPick(e.target.files)}
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => inputRef.current?.click()}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50 sm:w-auto"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              Upload file
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-6">
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
            </div>
          ) : uploads.length > 0 ? (
            <ul className="space-y-3">
              {uploads.map((f) => (
                <li
                  key={f.id}
                  className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <FileText
                      className="h-5 w-5 shrink-0 text-[var(--color-muted)]"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--color-text)]">
                        {f.file_name}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">
                        {formatBytes(f.size_bytes)}
                        {f.created_at
                          ? ` · ${new Date(f.created_at).toLocaleDateString()}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1 self-end sm:self-auto">
                    <a
                      href={`/api/files/download?path=${encodeURIComponent(f.storage_path)}`}
                      className="rounded-lg p-2 text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
                      aria-label={`Download ${f.file_name}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                    <button
                      type="button"
                      onClick={() => void remove(f.id, f.file_name)}
                      className="rounded-lg p-2 text-red-400 hover:bg-red-500/10"
                      aria-label={`Delete ${f.file_name}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <div className="py-10 text-center">
              <FileText
                className="mx-auto mb-4 h-12 w-12 text-[var(--color-muted)]"
                aria-hidden
              />
              <h3 className="text-lg font-semibold text-[var(--color-text)]">
                No uploads yet
              </h3>
              <p className="mx-auto mt-2 max-w-md text-sm text-[var(--color-muted)]">
                Share documents with the team using Upload file above, or send
                images in Messages.
              </p>
            </div>
          )}
        </div>
      </div>

      {sanityFiles.length > 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4 sm:p-6">
          <h3 className="mb-4 text-sm font-semibold text-[var(--color-text)]">
            Shared by Alpha Solutions
          </h3>
          <ul className="space-y-3">
            {sanityFiles.map((f) => {
              const href = f.downloadUrl || f.fileAssetUrl || "#";
              return (
                <li
                  key={f._id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-[var(--color-text)]">
                      {f.fileName}
                    </p>
                    {f.projectTitle ? (
                      <span className="mt-1 inline-block text-xs text-[var(--color-muted)]">
                        {f.projectTitle}
                      </span>
                    ) : null}
                  </div>
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg p-2 text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
                  >
                    <Download className="h-4 w-4" />
                  </a>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
