"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  FileText,
  Loader2,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import {
  ChatMessageBubble,
  formatDocFieldsAsMessage,
  type DocAnalysis,
} from "@/components/freight/ChatMessageBubble";
import { isImageMime, isPdfMime, resolveUploadMime } from "@/lib/freight/upload-mime";
import { createLoadFromRc } from "@/lib/freight/rc-to-load";
import type { ChatAttachment, ChatMessage } from "@/lib/freight/chat-types";

type ChatMode = "carrier" | "load" | "group";

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
  enableCreateLoadFromRc = false,
  monthTab,
  viewerRole = "dispatcher",
  onSendComplete,
  onLoadCreated,
  onBack,
}: {
  mode: ChatMode;
  carrierProfileId?: string;
  loadId?: string;
  threadId?: string;
  title?: string;
  emptyHint?: string;
  enableAiAssist?: boolean;
  enableCreateLoadFromRc?: boolean;
  monthTab?: string;
  viewerRole?: "dispatcher" | "carrier" | "driver";
  onSendComplete?: () => void;
  onLoadCreated?: (message: string) => void;
  /** Mobile WhatsApp-style: show back control and edge-to-edge panel */
  onBack?: () => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [pendingFiles, setPendingFiles] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [enhancing, setEnhancing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [docAnalysis, setDocAnalysis] = useState<DocAnalysis | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [askOpen, setAskOpen] = useState(false);
  const [askDraft, setAskDraft] = useState("");
  const [askBusy, setAskBusy] = useState(false);
  const [askReplies, setAskReplies] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    setDocAnalysis(null);
    void loadMessages();
    const t = setInterval(() => void loadMessages(), 12000);
    return () => clearInterval(t);
  }, [loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, docAnalysis]);

  async function parseUploadedDocument(file: File, attachment: ChatAttachment) {
    const form = new FormData();
    form.set("file", file);
    form.set("docType", "rate_con");
    const res = await fetch("/api/freight/ai/parse-document", { method: "POST", body: form });
    const json = (await res.json()) as {
      error?: string;
      carrierSummary?: string;
      fields?: Record<string, string>;
      documentType?: string;
    };
    if (!res.ok) throw new Error(json.error ?? "Could not read document");
    setDocAnalysis({
      summary: json.carrierSummary ?? "Document analyzed",
      fields: json.fields ?? {},
      documentType: json.documentType ?? "other",
      file,
      attachment,
    });
  }

  async function uploadFile(file: File) {
    setUploading(true);
    setStatusMsg(null);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/freight/chat/upload", { method: "POST", body: form });
      const json = (await res.json()) as { attachment?: ChatAttachment; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Upload failed");
      if (json.attachment) {
        const att = {
          ...json.attachment,
          docType:
            isPdfMime(json.attachment.mime) ||
            file.name.toLowerCase().includes("rc") ||
            file.name.toLowerCase().endsWith(".pdf")
              ? ("rate_con" as const)
              : ("other" as const),
        };
        setPendingFiles((p) => [...p, att]);
        const mime = resolveUploadMime(file) ?? json.attachment.mime;
        if (enableAiAssist && (isImageMime(mime) || isPdfMime(mime))) {
          await parseUploadedDocument(file, att);
        }
      }
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  async function askAlpha() {
    const text = askDraft.trim();
    if (!text || askBusy) return;
    setAskDraft("");
    setAskReplies((r) => [...r, { role: "user", content: text }]);
    setAskBusy(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/freight/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          chatContext: buildChatContext(messages, title),
          includeTmsData: true,
          ...(loadId ? { loadId } : {}),
          ...(carrierProfileId ? { carrierProfileId } : {}),
          ...(aiConversationId ? { conversationId: aiConversationId } : {}),
        }),
      });
      const json = (await res.json()) as {
        error?: string;
        reply?: string;
        conversationId?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Ask Alpha failed");
      if (json.conversationId) setAiConversationId(json.conversationId);
      setAskReplies((r) => [
        ...r,
        { role: "assistant", content: json.reply ?? "No reply." },
      ]);
    } catch (e) {
      setAskReplies((r) => [
        ...r,
        {
          role: "assistant",
          content: e instanceof Error ? e.message : "Ask Alpha failed",
        },
      ]);
    } finally {
      setAskBusy(false);
    }
  }

  async function enhanceDraft() {
    const text = draft.trim();
    if (!text) return;
    setEnhancing(true);
    setStatusMsg(null);
    try {
      const res = await fetch("/api/freight/ai/enhance-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          chatContext: buildChatContext(messages, title),
          includeTmsData: true,
          ...(loadId ? { loadId } : {}),
        }),
      });
      const json = (await res.json()) as { error?: string; enhanced?: string };
      if (!res.ok) throw new Error(json.error ?? "Enhance failed");
      if (json.enhanced) {
        setDraft(json.enhanced);
        textareaRef.current?.focus();
      }
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "AI enhance failed");
    } finally {
      setEnhancing(false);
    }
  }

  async function createLoadFromRcDoc() {
    if (!docAnalysis) return;
    setBusy(true);
    setStatusMsg(null);
    try {
      const result = await createLoadFromRc({
        fields: docAnalysis.fields,
        file: docAnalysis.file,
        monthTab: monthTab ?? "",
      });
      if (!result.ok) throw new Error(result.error ?? "Could not create load");
      setStatusMsg(result.message ?? "Load created from RC.");
      setDocAnalysis(null);
      onLoadCreated?.(result.message ?? "Load created.");
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Create load failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveRcToLoad() {
    if (!docAnalysis || !loadId) return;
    setBusy(true);
    try {
      const form = new FormData();
      form.set("loadId", loadId);
      form.set("type", "rate_con");
      form.set("file", docAnalysis.file);
      const res = await fetch("/api/freight/loads/documents", { method: "POST", body: form });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save RC");
      setStatusMsg("Rate confirmation saved — visible to carrier & driver on this load.");
      setDocAnalysis(null);
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  function insertDocIntoDraft() {
    if (!docAnalysis) return;
    const text = formatDocFieldsAsMessage(docAnalysis.fields);
    setDraft((prev) => (prev.trim() ? `${prev.trim()}\n\n${text}` : text));
    setDocAnalysis(null);
    textareaRef.current?.focus();
  }

  async function send() {
    if (busy) return;
    if (!draft.trim() && pendingFiles.length === 0) return;

    setBusy(true);
    setStatusMsg(null);
    try {
      const bodyText = draft.trim() || `[${pendingFiles.length} file(s)]`;

      if (mode === "carrier" && carrierProfileId) {
        const res = await fetch("/api/dispatcher/carriers/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            carrierProfileId,
            message: bodyText,
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
          body: JSON.stringify({ body: bodyText, attachments: pendingFiles }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Send failed");
        }
      } else if (mode === "group" && threadId) {
        const res = await fetch(`/api/freight/threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: bodyText, attachments: pendingFiles }),
        });
        if (!res.ok) {
          const json = (await res.json()) as { error?: string };
          throw new Error(json.error ?? "Send failed");
        }
      }

      setDraft("");
      setPendingFiles([]);
      setDocAnalysis(null);
      await loadMessages();
      onSendComplete?.();
    } catch (e) {
      setStatusMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  const hasThread =
    (mode === "carrier" && carrierProfileId) ||
    (mode === "load" && loadId) ||
    (mode === "group" && threadId);

  return (
    <div
      className={`flex h-full min-h-0 flex-col overflow-hidden bg-[#0a1018] ${
        onBack
          ? "rounded-none border-0 lg:rounded-2xl lg:border lg:border-[var(--color-border)]"
          : "rounded-2xl border border-[var(--color-border)]"
      }`}
    >
      {title || onBack ? (
        <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-3 sm:px-4">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              className="shrink-0 rounded-lg p-2 text-[var(--color-muted)] hover:bg-[var(--color-bg)] hover:text-[var(--color-text)] lg:hidden"
              aria-label="Back to chats"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
          ) : null}
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)]">
            {title ?? "Chat"}
          </p>
          {enableAiAssist ? (
            <button
              type="button"
              onClick={() => setAskOpen((o) => !o)}
              className={`shrink-0 inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold ${
                askOpen
                  ? "bg-[var(--color-accent)] text-[#05080f]"
                  : "border border-[var(--color-accent)]/40 text-[var(--color-accent)]"
              }`}
              title="Ask Alpha about this thread and TMS data"
            >
              <Bot className="h-3.5 w-3.5" />
              Ask Alpha
            </button>
          ) : null}
        </div>
      ) : null}

      {enableAiAssist && askOpen ? (
        <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-2">
          <p className="text-[10px] text-[var(--color-muted)]">
            Trained on this chat thread + your TMS loads
          </p>
          <div className="mt-2 max-h-36 space-y-2 overflow-y-auto">
            {askReplies.map((m, i) => (
              <p
                key={i}
                className={`whitespace-pre-wrap text-xs ${
                  m.role === "user"
                    ? "text-[var(--color-text)]"
                    : "text-[var(--color-accent)]"
                }`}
              >
                <span className="font-semibold opacity-70">
                  {m.role === "user" ? "You" : "Alpha"}:{" "}
                </span>
                {m.content}
              </p>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={askDraft}
              onChange={(e) => setAskDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void askAlpha();
                }
              }}
              placeholder="Ask about this chat or loads…"
              className="dispatch-field flex-1 rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
            />
            <button
              type="button"
              disabled={askBusy || !askDraft.trim()}
              onClick={() => void askAlpha()}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-2 text-xs font-semibold text-[#05080f] disabled:opacity-40"
            >
              {askBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Ask"}
            </button>
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-[url('/chat-bg.png')] bg-cover bg-center p-3 md:p-4"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 20%, rgba(56,163,255,0.04), transparent 40%), radial-gradient(circle at 80% 80%, rgba(0,92,75,0.06), transparent 45%)",
        }}
      >
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">
            {emptyHint ?? "No messages yet. Type below, enhance with AI, then send."}
          </p>
        ) : null}
        {messages.map((m) => (
          <ChatMessageBubble key={m.id} message={m} viewerRole={viewerRole} />
        ))}
      </div>

      {docAnalysis ? (
        <div className="shrink-0 border-t border-[var(--color-border)] bg-[var(--color-surface)]/90 px-3 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-[var(--color-accent)]">
                AI read your {docAnalysis.documentType === "rate_con" ? "RC" : "document"}
              </p>
              <p className="mt-1 text-sm text-[var(--color-text)]">{docAnalysis.summary}</p>
            </div>
            <button
              type="button"
              onClick={() => setDocAnalysis(null)}
              className="shrink-0 rounded p-1 text-[var(--color-muted)] hover:text-[var(--color-text)]"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={insertDocIntoDraft}
              className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
            >
              Insert into message
            </button>
            {enableCreateLoadFromRc &&
            docAnalysis.documentType === "rate_con" &&
            !loadId ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void createLoadFromRcDoc()}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
              >
                Create load from RC
              </button>
            ) : null}
            {loadId && docAnalysis.documentType === "rate_con" ? (
              <button
                type="button"
                disabled={busy}
                onClick={() => void saveRcToLoad()}
                className="rounded-lg border border-emerald-500/50 px-3 py-1.5 text-xs font-semibold text-emerald-300 disabled:opacity-40"
              >
                Save RC to load (carrier & driver see it)
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      {pendingFiles.length > 0 ? (
        <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--color-border)] px-3 py-2">
          {pendingFiles.map((a, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--color-accent-dim)] px-2.5 py-1 text-[10px] text-[var(--color-accent)]"
            >
              <FileText className="h-3 w-3" />
              {a.name}
            </span>
          ))}
        </div>
      ) : null}

      {statusMsg ? (
        <p className="shrink-0 px-3 py-1 text-xs text-[var(--color-muted)]">{statusMsg}</p>
      ) : null}

      <div className="flex shrink-0 items-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface)]/80 p-2 md:p-3">
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
          disabled={uploading || !hasThread}
          onClick={() => fileRef.current?.click()}
          className="rounded-full border border-[var(--color-border)] p-2.5 text-[var(--color-muted)] hover:text-[var(--color-accent)] disabled:opacity-40"
          title="Attach RC, BOL, or POD"
        >
          {uploading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Paperclip className="h-5 w-5" />}
        </button>
        {enableAiAssist ? (
          <button
            type="button"
            disabled={enhancing || !draft.trim()}
            onClick={() => void enhanceDraft()}
            className="rounded-full border border-[var(--color-accent)]/40 p-2.5 text-[var(--color-accent)] disabled:opacity-40"
            title="Enhance message with AI (then send to carrier)"
          >
            {enhancing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Sparkles className="h-5 w-5" />}
          </button>
        ) : null}
        <textarea
          ref={textareaRef}
          value={draft}
          rows={1}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
          placeholder={
            enableAiAssist
              ? "Type load details… tap ✨ to enhance, then Send"
              : "Message…"
          }
          className="dispatch-field max-h-32 min-h-[44px] flex-1 resize-none rounded-2xl border border-[var(--color-border)] px-4 py-2.5 text-sm leading-snug"
        />
        <button
          type="button"
          disabled={busy || !hasThread || (!draft.trim() && pendingFiles.length === 0)}
          onClick={() => void send()}
          className="rounded-full bg-[#005c4b] p-2.5 text-white disabled:opacity-40"
          title="Send to carrier"
        >
          {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Send className="h-5 w-5" />}
        </button>
      </div>
    </div>
  );
}
