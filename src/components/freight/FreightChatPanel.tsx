"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, FileText, Loader2, Paperclip, Send, Sparkles } from "lucide-react";
import type { ChatAttachment, ChatMessage } from "@/lib/freight/chat-types";

type ChatMode = "carrier" | "load" | "group";

type AiLine = { role: "user" | "assistant"; content: string };

function buildChatContext(messages: ChatMessage[], title?: string): string {
  const lines = messages.slice(-15).map((m) => {
    const attach =
      m.attachments?.length ? ` [${m.attachments.map((a) => a.name).join(", ")}]` : "";
    return `${m.sender_role}: ${m.body || "(attachment)"}${attach}`;
  });
  return [title ? `Thread: ${title}` : null, ...lines].filter(Boolean).join("\n");
}

export function FreightChatPanel({
  mode,
  carrierProfileId,
  loadId,
  threadId,
  title,
  emptyHint,
  enableAiAssist = false,
  onSendComplete,
}: {
  mode: ChatMode;
  carrierProfileId?: string;
  loadId?: string;
  threadId?: string;
  title?: string;
  emptyHint?: string;
  enableAiAssist?: boolean;
  onSendComplete?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [aiLines, setAiLines] = useState<AiLine[]>([]);
  const [draft, setDraft] = useState("");
  const [aiMode, setAiMode] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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
    setAiLines([]);
    setConversationId(null);
    setAiMode(false);
    void loadMessages();
    const t = setInterval(() => void loadMessages(), 15000);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, aiLines]);

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

  async function askAi(question: string) {
    setBusy(true);
    setAiLines((lines) => [...lines, { role: "user", content: question }]);
    try {
      const res = await fetch("/api/freight/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          conversationId: conversationId ?? undefined,
          chatContext: buildChatContext(messages, title),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        reply?: string;
        conversationId?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "AI failed");
      if (json.conversationId) setConversationId(json.conversationId);
      setAiLines((lines) => [...lines, { role: "assistant", content: json.reply ?? "" }]);
    } catch (e) {
      setAiLines((lines) => [
        ...lines,
        { role: "assistant", content: e instanceof Error ? e.message : "Error" },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (busy) return;
    if (!draft.trim() && pendingFiles.length === 0) return;

    if (aiMode) {
      const q = draft.trim();
      setDraft("");
      await askAi(q);
      return;
    }

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

  const hasThread =
    (mode === "carrier" && carrierProfileId) ||
    (mode === "load" && loadId) ||
    (mode === "group" && threadId);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
      {title ? (
        <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
          <p className="text-sm font-semibold text-[var(--color-text)]">{title}</p>
          {enableAiAssist && hasThread ? (
            <button
              type="button"
              onClick={() => setAiMode((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold ${
                aiMode
                  ? "bg-[var(--color-accent)] text-[#05080f]"
                  : "border border-[var(--color-border)] text-[var(--color-muted)]"
              }`}
            >
              <Sparkles className="h-3 w-3" />
              {aiMode ? "Alpha AI on" : "Ask Alpha AI"}
            </button>
          ) : null}
        </div>
      ) : null}
      <div ref={scrollRef} className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && aiLines.length === 0 ? (
          <p className="text-sm text-[var(--color-muted)]">
            {emptyHint ?? "No messages yet. Send text, PDF, RC, BOL, or POD."}
          </p>
        ) : null}
        {messages.map((m) => (
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
        ))}
        {aiLines.map((line, i) => (
          <div
            key={`ai-${i}`}
            className={`rounded-lg px-3 py-2 text-sm ${
              line.role === "user"
                ? "ml-8 border border-[var(--color-accent)]/30 bg-[var(--color-accent-dim)]/40"
                : "mr-8 border border-[var(--color-border)] bg-[var(--color-surface)]"
            }`}
          >
            <span className="flex items-center gap-1 text-[10px] uppercase text-[var(--color-accent)]">
              {line.role === "user" ? "You → Alpha AI" : <><Bot className="h-3 w-3" /> Alpha AI</>}
            </span>
            <p className="mt-1 whitespace-pre-wrap text-[var(--color-text)]">{line.content}</p>
          </div>
        ))}
      </div>
      {pendingFiles.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--color-border)] px-3 py-2">
          {pendingFiles.map((a, i) => (
            <span key={i} className="rounded bg-[var(--color-accent-dim)] px-2 py-0.5 text-[10px]">
              {a.name}
            </span>
          ))}
        </div>
      ) : null}
      <div className="flex shrink-0 gap-2 border-t border-[var(--color-border)] p-3">
        {!aiMode ? (
          <>
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadFile(f);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
              title="Attach PDF or image (RC, BOL, POD)"
            >
              {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Paperclip className="h-4 w-4" />}
            </button>
          </>
        ) : (
          <Bot className="mt-2 h-4 w-4 shrink-0 text-[var(--color-accent)]" />
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void send()}
          placeholder={aiMode ? "Ask Alpha about this conversation…" : "Message…"}
          className="dispatch-field flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void send()}
          className="rounded-lg bg-[var(--color-accent)] p-2 text-[#05080f] disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
