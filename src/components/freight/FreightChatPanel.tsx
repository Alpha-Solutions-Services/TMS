"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FileText, Loader2, Paperclip, Send } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/lib/freight/chat-types";

type ChatMode = "carrier" | "load" | "group";

export function FreightChatPanel({
  mode,
  carrierProfileId,
  loadId,
  threadId,
  title,
  emptyHint,
  onSendComplete,
}: {
  mode: ChatMode;
  carrierProfileId?: string;
  loadId?: string;
  threadId?: string;
  title?: string;
  emptyHint?: string;
  onSendComplete?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadMessages = useCallback(async () => {
    if (mode === "carrier" && carrierProfileId) {
      const res = await fetch(
        `/api/dispatcher/carriers/messages?carrierProfileId=${encodeURIComponent(carrierProfileId)}`,
      );
      if (res.ok) {
        const json = (await res.json()) as { messages?: ChatMessage[] };
        setMessages(json.messages ?? []);
      }
      return;
    }
    if (mode === "load" && loadId) {
      const res = await fetch(`/api/freight/load-threads/${loadId}/messages`);
      if (res.ok) {
        const json = (await res.json()) as { messages?: ChatMessage[] };
        setMessages(json.messages ?? []);
      }
      return;
    }
    if (mode === "group" && threadId) {
      const res = await fetch(`/api/freight/threads/${threadId}/messages`);
      if (res.ok) {
        const json = (await res.json()) as { messages?: ChatMessage[] };
        setMessages(json.messages ?? []);
      }
    }
  }, [mode, carrierProfileId, loadId, threadId]);

  useEffect(() => {
    void loadMessages();
    const t = setInterval(() => void loadMessages(), 15000);
    return () => clearInterval(t);
  }, [loadMessages]);

  async function uploadFile(file: File) {
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/freight/chat/upload", { method: "POST", body: form });
      const json = (await res.json()) as { attachment?: ChatAttachment; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (json.attachment) setPendingFiles((p) => [...p, json.attachment!]);
    } finally {
      setUploading(false);
    }
  }

  async function send() {
    if (busy) return;
    if (!draft.trim() && pendingFiles.length === 0) return;
    setBusy(true);
    try {
      if (mode === "carrier" && carrierProfileId) {
        const res = await fetch("/api/dispatcher/carriers/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrierProfileId,
            message: draft.trim() || `[${pendingFiles.length} file(s)]`,
            attachments: pendingFiles,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Send failed");
        }
      } else if (mode === "load" && loadId) {
        const res = await fetch(`/api/freight/load-threads/${loadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: draft.trim(), attachments: pendingFiles }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Send failed");
        }
      } else if (mode === "group" && threadId) {
        const res = await fetch(`/api/freight/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            body: draft.trim() || `[${pendingFiles.length} file(s)]`,
            attachments: pendingFiles,
          }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Send failed");
        }
      }
      setDraft("");
      setPendingFiles([]);
      await loadMessages();
      onSendComplete?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-full min-h-[360px] flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
      {title ? (
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
        </div>
      ) : null}
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            {emptyHint ?? "No messages yet. Send text, PDF, RC, BOL, or POD."}
          </p>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="rounded-lg bg-[var(--color-bg)]/60 px-3 py-2 text-sm">
              <span className="text-[10px] uppercase text-[var(--color-accent)]">
                {m.sender_role} · {new Date(m.created_at).toLocaleString()}
              </span>
              {m.body ? <p className="mt-1 whitespace-pre-wrap text-[var(--color-text)]">{m.body}</p> : null}
              {m.attachments?.length ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {m.attachments.map((a, i) => (
                    <a
                      key={i}
                      href={a.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-accent)]"
                    >
                      <FileText className="h-3 w-3" />
                      {a.name}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
      </div>
      {pendingFiles.length > 0 ? (
        <div className="flex flex-wrap gap-2 border-t border-[var(--color-border)] px-3 py-2">
          {pendingFiles.map((a, i) => (
            <span key={i} className="rounded bg-[var(--color-accent-dim)] px-2 py-0.5 text-[10px]">
              {a.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex gap-2 border-t border-[var(--color-border)] p-3">
        <input ref={fileRef} type="file" accept=".pdf,image/*" className="hidden" onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void uploadFile(f);
          e.target.value = "";
        }} />
        <button
          type="button"
          disabled={uploading}
          onClick={() => fileRef.current?.click()}
          className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          title="Attach PDF or image (RC, BOL, POD)"
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
          placeholder="Message…"
          className="dispatch-field flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="rounded-lg bg-[var(--color-accent)] p-2 text-[#05080f] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
