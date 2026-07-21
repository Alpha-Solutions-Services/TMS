"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Loader2, Send, Sparkles, UserRound } from "lucide-react";
import clsx from "clsx";

type Msg = {
  role: "user" | "assistant";
  content: string;
  is_human?: boolean;
};

export function AiChatPanel() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>();
  const [humanJoined, setHumanJoined] = useState(false);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, humanJoined]);

  useEffect(() => {
    if (!conversationId) return;
    const id = window.setInterval(() => {
      void fetch(`/api/ai/conversations?id=${conversationId}`)
        .then((r) => r.json())
        .then(
          (j: {
            conversation?: { human_joined?: boolean };
            messages?: Array<{
              role: string;
              content: string;
              is_human?: boolean;
            }>;
          }) => {
            if (j.conversation?.human_joined) setHumanJoined(true);
            if (j.messages) {
              setMessages(
                j.messages
                  .filter((m) => m.role === "user" || m.role === "assistant")
                  .map((m) => ({
                    role: m.role as "user" | "assistant",
                    content: m.content,
                    is_human: m.is_human,
                  }))
              );
            }
          }
        )
        .catch(() => {});
    }, 8000);
    return () => window.clearInterval(id);
  }, [conversationId]);

  async function send() {
    const message = text.trim();
    if (!message || busy) return;
    setBusy(true);
    setError(null);
    setText("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, conversationId }),
      });
      const json = (await res.json()) as {
        reply?: string;
        conversationId?: string;
        humanJoined?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error || "Assistant unavailable");
      if (json.conversationId) setConversationId(json.conversationId);
      if (json.humanJoined) setHumanJoined(true);
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          content: json.reply || "",
          is_human: false,
        },
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex h-[min(72vh,680px)] flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
      <div className="flex items-center justify-between border-b border-[var(--color-border)] bg-[var(--color-surface-2)]/80 px-4 py-3">
        <div>
          <p
            className="flex items-center gap-2 font-semibold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
            Alpha Assistant
          </p>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Guided support for requirements, projects, and tickets.
          </p>
        </div>
        {humanJoined ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-300">
            <UserRound className="h-3.5 w-3.5" />
            Human agent here
          </span>
        ) : null}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-3 py-10 text-center">
            <p className="text-sm text-[var(--color-muted)]">
              Tell me what you need — a website, app, automation, or help with an
              existing project. I will guide you and suggest a ticket if needed.
            </p>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div
                key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className={clsx(
                  "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
                  m.role === "user"
                    ? "ml-auto bg-[var(--color-accent)] text-[#05080f]"
                    : m.is_human
                      ? "mr-auto border border-emerald-500/40 bg-emerald-500/10 text-[var(--color-text)]"
                      : "mr-auto border border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text)]"
                )}
              >
                {m.role === "assistant" && m.is_human ? (
                  <p className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                    <UserRound className="h-3 w-3" /> Team
                  </p>
                ) : null}
                <p className="whitespace-pre-wrap">{m.content}</p>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
        <div ref={bottomRef} />
      </div>

      {error ? <p className="px-4 text-xs text-red-400">{error}</p> : null}

      <div className="flex gap-2 border-t border-[var(--color-border)] p-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
          placeholder="Describe what you need…"
          className="flex-1 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => void send()}
          className="rounded-xl bg-[var(--color-accent)] p-2.5 text-[#05080f] disabled:opacity-40"
        >
          {busy ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
