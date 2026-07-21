"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ImagePlus,
  Loader2,
  Pencil,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";

export type ChatMessage = {
  id: string;
  is_admin: boolean;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
  attachment_path?: string | null;
  attachment_mime?: string | null;
  attachment_name?: string | null;
  attachment_url?: string | null;
  sender_id?: string;
};

type Mode = "client" | "admin";

type Props = {
  mode: Mode;
  threadId?: string | null;
  apiBase?: string;
  currentUserId?: string;
  onComposeAssist?: (action: "draft" | "summarize" | "next") => Promise<string | void>;
  className?: string;
};

function sameDay(a: string, b: string) {
  return new Date(a).toDateString() === new Date(b).toDateString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function WhatsAppChat({
  mode,
  threadId: externalThreadId,
  currentUserId,
  onComposeAssist,
  className,
}: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [threadId, setThreadId] = useState<string | null>(externalThreadId ?? null);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [assistBusy, setAssistBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    if (mode === "admin" && !externalThreadId) {
      setMessages([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const url =
        mode === "admin"
          ? `/api/admin/threads/${externalThreadId}/messages`
          : "/api/dm";
      const res = await fetch(url);
      const json = (await res.json()) as {
        messages?: ChatMessage[];
        threadId?: string;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Failed to load");
      setMessages(json.messages ?? []);
      if (json.threadId) setThreadId(json.threadId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [mode, externalThreadId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const tid = mode === "admin" ? externalThreadId : threadId;
    if (!tid) return;
    const supabase = createClient();
    if (!supabase) {
      const id = window.setInterval(() => void load(), 12000);
      return () => window.clearInterval(id);
    }
    const channel = supabase
      .channel(`dm-${tid}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "dm_messages",
          filter: `thread_id=eq.${tid}`,
        },
        () => {
          void load();
        }
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [mode, externalThreadId, threadId, load]);

  async function uploadAttachment(file: File): Promise<{
    path: string;
    mime: string;
    name: string;
    url?: string;
  } | null> {
    const fd = new FormData();
    fd.append("file", file);
    if (mode === "admin" && externalThreadId) {
      fd.append("threadId", externalThreadId);
    }
    const res = await fetch("/api/dm/upload", { method: "POST", body: fd });
    if (!res.ok) return null;
    return (await res.json()) as {
      path: string;
      mime: string;
      name: string;
      url?: string;
    };
  }

  async function send(e?: FormEvent) {
    e?.preventDefault();
    const body = text.trim();
    if ((!body && !pendingFile) || sending) return;
    if (mode === "admin" && !externalThreadId) return;

    setSending(true);
    setError(null);
    try {
      let attachment: {
        path: string;
        mime: string;
        name: string;
        url?: string;
      } | null = null;
      if (pendingFile) {
        attachment = await uploadAttachment(pendingFile);
        if (!attachment) throw new Error("Image upload failed");
      }

      if (editingId) {
        const res = await fetch(`/api/dm/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (!res.ok) throw new Error("Edit failed");
        setEditingId(null);
        setText("");
        await load();
        return;
      }

      const payload: Record<string, unknown> = { body };
      if (attachment) {
        payload.attachment_path = attachment.path;
        payload.attachment_mime = attachment.mime;
        payload.attachment_name = attachment.name;
      }

      const url =
        mode === "admin"
          ? `/api/admin/threads/${externalThreadId}/messages`
          : "/api/dm";
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error((j as { error?: string }).error || "Send failed");
      }
      setText("");
      setPendingFile(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Send failed");
    } finally {
      setSending(false);
    }
  }

  async function softDelete(id: string) {
    const res = await fetch(`/api/dm/${id}`, { method: "DELETE" });
    if (res.ok) await load();
  }

  function startEdit(m: ChatMessage) {
    if (m.deleted_at) return;
    setEditingId(m.id);
    setText(m.body || "");
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  async function runAssist(action: "draft" | "summarize" | "next") {
    if (!onComposeAssist) return;
    setAssistBusy(true);
    try {
      const result = await onComposeAssist(action);
      if (typeof result === "string" && result.trim()) {
        setText((prev) => (prev ? `${prev}\n\n${result}` : result));
      }
    } finally {
      setAssistBusy(false);
    }
  }

  const mine = (m: ChatMessage) =>
    mode === "admin" ? m.is_admin : !m.is_admin;

  return (
    <div
      className={clsx(
        "flex h-[min(70vh,640px)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40",
        className
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-4 py-3">
        <div>
          <p
            className="font-semibold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            {mode === "admin" ? "Client conversation" : "Messages"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            WhatsApp-style chat · images · edit your messages
          </p>
        </div>
        {mode === "admin" && onComposeAssist ? (
          <div className="flex flex-wrap gap-1">
            {(
              [
                ["draft", "Draft"],
                ["summarize", "Summarize"],
                ["next", "Next step"],
              ] as const
            ).map(([action, label]) => (
              <button
                key={action}
                type="button"
                disabled={assistBusy || !externalThreadId}
                onClick={() => void runAssist(action)}
                className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent-dim)] disabled:opacity-40"
              >
                <Sparkles className="h-3 w-3" />
                {label}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div
        ref={listRef}
        className="relative flex-1 space-y-1 overflow-y-auto bg-[radial-gradient(ellipse_at_top,_rgba(56,163,255,0.06),_transparent_55%)] px-3 py-4"
      >
        {loading ? (
          <div className="flex h-full items-center justify-center text-[var(--color-muted)]">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <p className="py-16 text-center text-sm text-[var(--color-muted)]">
            No messages yet. Say hello to start the conversation.
          </p>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => {
              const showDay =
                i === 0 || !sameDay(messages[i - 1].created_at, m.created_at);
              const outgoing = mine(m);
              return (
                <div key={m.id}>
                  {showDay ? (
                    <div className="my-3 flex justify-center">
                      <span className="rounded-full bg-[var(--color-bg)]/80 px-3 py-0.5 text-[11px] text-[var(--color-muted)]">
                        {dayLabel(m.created_at)}
                      </span>
                    </div>
                  ) : null}
                  <motion.div
                    initial={{ opacity: 0, y: 8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ duration: 0.2 }}
                    className={clsx(
                      "group mb-1 flex",
                      outgoing ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={clsx(
                        "relative max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm sm:max-w-[75%]",
                        outgoing
                          ? "rounded-br-md bg-[var(--color-accent)] text-[#05080f]"
                          : "rounded-bl-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                      )}
                    >
                      {m.deleted_at ? (
                        <p className="italic opacity-70">Message deleted</p>
                      ) : (
                        <>
                          {m.attachment_url || m.attachment_path ? (
                            <button
                              type="button"
                              className="mb-2 block overflow-hidden rounded-lg"
                              onClick={() =>
                                setLightbox(
                                  m.attachment_url ||
                                    `/api/dm/attachment?path=${encodeURIComponent(m.attachment_path!)}`
                                )
                              }
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={
                                  m.attachment_url ||
                                  `/api/dm/attachment?path=${encodeURIComponent(m.attachment_path!)}`
                                }
                                alt={m.attachment_name || "Attachment"}
                                className="max-h-52 max-w-full object-cover"
                              />
                            </button>
                          ) : null}
                          {m.body ? <p className="whitespace-pre-wrap break-words">{m.body}</p> : null}
                        </>
                      )}
                      <div
                        className={clsx(
                          "mt-1 flex items-center justify-end gap-2 text-[10px]",
                          outgoing ? "text-[#05080f]/70" : "text-[var(--color-muted)]"
                        )}
                      >
                        {m.edited_at && !m.deleted_at ? <span>edited</span> : null}
                        <span>
                          {new Date(m.created_at).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                      {!m.deleted_at &&
                      (mode === "admin" ? m.is_admin : !m.is_admin) &&
                      (!currentUserId || m.sender_id === currentUserId || !m.sender_id) ? (
                        <div
                          className={clsx(
                            "absolute -top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100",
                            outgoing ? "right-1" : "left-1"
                          )}
                        >
                          <button
                            type="button"
                            aria-label="Edit"
                            onClick={() => startEdit(m)}
                            className="rounded-full bg-[var(--color-bg)] p-1 text-[var(--color-muted)] shadow hover:text-[var(--color-accent)]"
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                          <button
                            type="button"
                            aria-label="Delete"
                            onClick={() => void softDelete(m.id)}
                            className="rounded-full bg-[var(--color-bg)] p-1 text-[var(--color-muted)] shadow hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                </div>
              );
            })}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {error ? (
        <p className="px-4 py-1 text-xs text-red-400">{error}</p>
      ) : null}

      {pendingFile ? (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] px-4 py-2 text-xs text-[var(--color-muted)]">
          <ImagePlus className="h-4 w-4 text-[var(--color-accent)]" />
          {pendingFile.name}
          <button
            type="button"
            onClick={() => setPendingFile(null)}
            className="ml-auto text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {editingId ? (
        <div className="flex items-center gap-2 border-t border-[var(--color-border)] bg-[var(--color-accent-dim)]/30 px-4 py-1.5 text-xs text-[var(--color-accent)]">
          Editing message
          <button
            type="button"
            className="ml-auto underline"
            onClick={() => {
              setEditingId(null);
              setText("");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      <form
        onSubmit={(e) => void send(e)}
        className="flex items-end gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/90 p-3"
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPendingFile(f);
            e.target.value = "";
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={!!editingId || (mode === "admin" && !externalThreadId)}
          className="rounded-xl border border-[var(--color-border)] p-2.5 text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-accent)] disabled:opacity-40"
          aria-label="Attach image"
        >
          <ImagePlus className="h-5 w-5" />
        </button>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          rows={1}
          disabled={mode === "admin" && !externalThreadId}
          placeholder={
            mode === "admin" && !externalThreadId
              ? "Select a client thread…"
              : "Type a message"
          }
          className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)] disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={
            sending ||
            (!text.trim() && !pendingFile) ||
            (mode === "admin" && !externalThreadId)
          }
          className="rounded-xl bg-[var(--color-accent)] p-2.5 text-[#05080f] transition hover:brightness-110 disabled:opacity-40"
          aria-label="Send"
        >
          {sending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </form>

      <AnimatePresence>
        {lightbox ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 p-4"
            onClick={() => setLightbox(null)}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={lightbox}
              alt="Preview"
              className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
