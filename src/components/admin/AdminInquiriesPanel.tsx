"use client";

import { useMemo, useState } from "react";
import {
  Loader2,
  Mail,
  Sparkles,
  X,
} from "lucide-react";
import clsx from "clsx";
import { useUi } from "@/components/ui/UiProvider";

export type InquiryRow = {
  id: string;
  created_at: string;
  name: string;
  email: string;
  phone: string | null;
  budget: string | null;
  service_slug: string;
  message: string;
  status: string;
  admin_notes?: string | null;
};

export function AdminInquiriesPanel({
  inquiries,
  onRefresh,
  onPatchStatus,
}: {
  inquiries: InquiryRow[];
  onRefresh: () => void;
  onPatchStatus: (id: string, status: string) => Promise<void>;
}) {
  const { toast } = useUi();
  const [selected, setSelected] = useState<InquiryRow | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [sendBusy, setSendBusy] = useState(false);

  const sorted = useMemo(
    () =>
      [...inquiries].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      ),
    [inquiries]
  );

  function openInquiry(row: InquiryRow) {
    setSelected(row);
    setSubject(`Re: Your inquiry — ${row.service_slug.replace(/-/g, " ")}`);
    setBody("");
  }

  async function draftWithAi() {
    if (!selected) return;
    setDraftBusy(true);
    try {
      const res = await fetch("/api/ai/assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "draft",
          inquiryId: selected.id,
        }),
      });
      const j = (await res.json()) as {
        text?: string;
        subject?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(j.error || "Draft failed");
      if (j.subject) setSubject(j.subject);
      setBody(j.text || "");
      toast({
        kind: "success",
        title: "Draft ready",
        message: "Review and edit before sending.",
      });
    } catch (e) {
      toast({
        kind: "error",
        title: "Could not draft",
        message: e instanceof Error ? e.message : "Try again",
      });
    } finally {
      setDraftBusy(false);
    }
  }

  async function sendEmail() {
    if (!selected) return;
    if (!subject.trim() || body.trim().length < 10) {
      toast({
        kind: "error",
        title: "Incomplete message",
        message: "Add a subject and a short reply body.",
      });
      return;
    }
    setSendBusy(true);
    try {
      const res = await fetch(`/api/admin/inquiries/${selected.id}/reply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: subject.trim(),
          body: body.trim(),
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Send failed");
      toast({
        kind: "success",
        title: "Email sent",
        message: `Delivered to ${selected.email}`,
      });
      setSelected(null);
      onRefresh();
    } catch (e) {
      toast({
        kind: "error",
        title: "Send failed",
        message: e instanceof Error ? e.message : "Check SMTP settings",
      });
    } finally {
      setSendBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--color-muted)]">
        Open an inquiry to draft an AI reply and send it by email from the
        portal.
      </p>

      {/* Mobile cards */}
      <div className="grid gap-3 md:hidden">
        {sorted.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => openInquiry(row)}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4 text-left"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[var(--color-text)]">
                  {row.name}
                </p>
                <p className="text-xs text-[var(--color-accent)]">{row.email}</p>
              </div>
              <span className="rounded-full border border-[var(--color-border)] px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                {row.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              {row.service_slug} · {new Date(row.created_at).toLocaleDateString()}
            </p>
            <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted)]">
              {row.message}
            </p>
          </button>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden max-h-[70vh] overflow-auto rounded-xl border border-[var(--color-border)] md:block">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="sticky top-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]/95 backdrop-blur">
            <tr>
              <th className="p-3">Date</th>
              <th className="p-3">Contact</th>
              <th className="p-3">Service</th>
              <th className="p-3">Message</th>
              <th className="p-3">Status</th>
              <th className="p-3">Reply</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={row.id}
                className="border-b border-[var(--color-border)]/60 align-top"
              >
                <td className="p-3 text-[var(--color-muted)] whitespace-nowrap">
                  {new Date(row.created_at).toLocaleString()}
                </td>
                <td className="p-3">
                  <div className="font-medium text-[var(--color-text)]">
                    {row.name}
                  </div>
                  <div className="text-[var(--color-accent)]">{row.email}</div>
                </td>
                <td className="p-3 text-[var(--color-muted)]">
                  {row.service_slug}
                </td>
                <td className="max-w-xs p-3 text-[var(--color-muted)]">
                  <p className="line-clamp-3">{row.message}</p>
                </td>
                <td className="p-3">
                  <select
                    value={row.status}
                    onChange={(e) => void onPatchStatus(row.id, e.target.value)}
                    className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                  >
                    <option value="new">new</option>
                    <option value="contacted">contacted</option>
                    <option value="closed">closed</option>
                  </select>
                </td>
                <td className="p-3">
                  <button
                    type="button"
                    onClick={() => openInquiry(row)}
                    className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)]"
                  >
                    <Mail className="h-3.5 w-3.5" /> Email
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selected ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--glow-md)] sm:rounded-2xl">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] p-4 sm:p-5">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                  Inquiry reply
                </p>
                <h3
                  className="truncate text-lg font-bold text-[var(--color-text)]"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  {selected.name}
                </h3>
                <p className="text-sm text-[var(--color-muted)]">
                  {selected.email}
                  {selected.phone ? ` · ${selected.phone}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-4 overflow-y-auto p-4 sm:p-5">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/50 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                  Their message · {selected.service_slug}
                  {selected.budget ? ` · Budget ${selected.budget}` : ""}
                </p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-[var(--color-text)]">
                  {selected.message}
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={draftBusy}
                  onClick={() => void draftWithAi()}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
                >
                  {draftBusy ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Sparkles className="h-4 w-4" />
                  )}
                  AI draft reply
                </button>
              </div>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--color-muted)]">
                  Subject
                </span>
                <input
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)]"
                />
              </label>

              <label className="block space-y-1.5">
                <span className="text-xs font-medium text-[var(--color-muted)]">
                  Email body
                </span>
                <textarea
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  rows={10}
                  placeholder="Write or generate a draft…"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2.5 text-sm text-[var(--color-text)]"
                />
              </label>
            </div>

            <div className="flex flex-col-reverse gap-2 border-t border-[var(--color-border)] p-4 sm:flex-row sm:justify-end sm:p-5">
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-xl border border-[var(--color-border)] px-4 py-2.5 text-sm text-[var(--color-muted)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={sendBusy}
                onClick={() => void sendEmail()}
                className={clsx(
                  "inline-flex items-center justify-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
                )}
              >
                {sendBusy ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4" />
                )}
                Send email
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
