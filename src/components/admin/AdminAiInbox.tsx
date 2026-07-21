"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, Sparkles, UserRound } from "lucide-react";
import clsx from "clsx";

type Conv = {
  id: string;
  title?: string | null;
  client_email?: string | null;
  human_joined?: boolean;
  updated_at?: string;
};

type Msg = {
  id: string;
  role: string;
  content: string;
  is_human?: boolean;
  created_at?: string;
};

export function AdminAiInbox({ initialId }: { initialId?: string | null }) {
  const [list, setList] = useState<Conv[]>([]);
  const [selected, setSelected] = useState<string | null>(initialId ?? null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [humanJoined, setHumanJoined] = useState(false);
  const [reply, setReply] = useState("");
  const [train, setTrain] = useState("");
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/ai/conversations");
    const j = (await res.json()) as { conversations?: Conv[] };
    setList(j.conversations ?? []);
  }, []);

  const loadOne = useCallback(async (id: string) => {
    setSelected(id);
    const res = await fetch(`/api/ai/conversations?id=${id}`);
    const j = (await res.json()) as {
      conversation?: { human_joined?: boolean };
      messages?: Msg[];
    };
    setHumanJoined(!!j.conversation?.human_joined);
    setMessages(j.messages ?? []);
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  useEffect(() => {
    if (initialId) void loadOne(initialId);
  }, [initialId, loadOne]);

  async function act(action: "join" | "leave" | "message" | "train") {
    if (!selected) return;
    setBusy(true);
    try {
      await fetch("/api/ai/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: selected,
          action,
          body: reply,
          trainingNotes: train,
        }),
      });
      if (action === "message") setReply("");
      if (action === "train") setTrain("");
      await loadOne(selected);
      await loadList();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/20">
        <div className="border-b border-[var(--color-border)] p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <Sparkles className="h-4 w-4 text-[var(--color-accent)]" />
            Assistant chats
          </h2>
          <p className="mt-1 text-xs text-[var(--color-muted)]">
            Same thread the client sees — join as human anytime.
          </p>
        </div>
        <ul className="max-h-[560px] divide-y divide-[var(--color-border)] overflow-y-auto">
          {list.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => void loadOne(c.id)}
                className={clsx(
                  "w-full px-4 py-3 text-left text-sm hover:bg-[var(--color-surface)]/40",
                  selected === c.id && "bg-[var(--color-accent-dim)]/25"
                )}
              >
                <p className="font-medium text-[var(--color-text)]">
                  {c.client_email || c.title || c.id.slice(0, 8)}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  {c.human_joined ? "Human joined" : "Assistant only"}
                </p>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="flex min-h-[560px] flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/20">
        {!selected ? (
          <p className="m-auto text-sm text-[var(--color-muted)]">
            Select a conversation.
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] p-3">
              {humanJoined ? (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-300">
                  <UserRound className="h-3 w-3" /> You are in this chat
                </span>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("join")}
                  className="rounded-lg bg-emerald-500/90 px-3 py-1.5 text-xs font-semibold text-[#05080f]"
                >
                  Join as human
                </button>
              )}
              {humanJoined ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void act("leave")}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs"
                >
                  Leave (resume Assistant)
                </button>
              ) : null}
            </div>

            <div className="flex-1 space-y-2 overflow-y-auto p-4">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={clsx(
                    "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                    m.role === "user"
                      ? "ml-auto bg-[var(--color-accent)] text-[#05080f]"
                      : m.is_human
                        ? "mr-auto border border-emerald-500/40 bg-emerald-500/10"
                        : "mr-auto border border-[var(--color-border)]"
                  )}
                >
                  {m.is_human ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase text-emerald-300">
                      Human
                    </p>
                  ) : m.role === "assistant" ? (
                    <p className="mb-1 text-[10px] font-semibold uppercase text-[var(--color-muted)]">
                      Assistant
                    </p>
                  ) : null}
                  <p className="whitespace-pre-wrap">{m.content}</p>
                </div>
              ))}
            </div>

            <div className="space-y-2 border-t border-[var(--color-border)] p-3">
              <div className="flex gap-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Reply as human in this chat…"
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !reply.trim()}
                  onClick={() => void act("message")}
                  className="rounded-xl bg-[var(--color-accent)] p-2.5 text-[#05080f] disabled:opacity-40"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  value={train}
                  onChange={(e) => setTrain(e.target.value)}
                  placeholder="Train Assistant on this chat (coaching notes)…"
                  className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
                />
                <button
                  type="button"
                  disabled={busy || !train.trim()}
                  onClick={() => void act("train")}
                  className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs font-semibold text-[var(--color-accent)]"
                >
                  Save training
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
