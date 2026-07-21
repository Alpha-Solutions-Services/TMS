"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, Plus, Users } from "lucide-react";
import Link from "next/link";

type Thread = { id: string; title: string; thread_type: string; updated_at: string };
type Msg = { id: string; sender_role: string; body: string; created_at: string };

export function DispatcherMessagesClient() {
  const [tab, setTab] = useState<"carriers" | "groups">("carriers");
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [newGroupTitle, setNewGroupTitle] = useState("");
  const [newGroupMembers, setNewGroupMembers] = useState("");
  const [busy, setBusy] = useState(false);

  const loadThreads = useCallback(async () => {
    const res = await fetch("/api/freight/threads");
    if (res.ok) {
      const json = (await res.json()) as { threads?: Thread[] };
      setThreads(json.threads ?? []);
    }
  }, []);

  const loadMessages = useCallback(async (threadId: string) => {
    const res = await fetch(`/api/freight/threads/${threadId}/messages`);
    if (res.ok) {
      const json = (await res.json()) as { messages?: Msg[] };
      setMessages(json.messages ?? []);
    }
  }, []);

  useEffect(() => {
    void loadThreads();
  }, [loadThreads]);

  useEffect(() => {
    if (activeId) void loadMessages(activeId);
  }, [activeId, loadMessages]);

  async function sendGroupMessage() {
    if (!activeId || !draft.trim()) return;
    setBusy(true);
    try {
      await fetch(`/api/freight/threads/${activeId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
      setDraft("");
      await loadMessages(activeId);
    } finally {
      setBusy(false);
    }
  }

  async function createGroup() {
    const ids = newGroupMembers
      .split(/[\s,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!newGroupTitle.trim() || ids.length === 0) return;
    setBusy(true);
    try {
      const res = await fetch("/api/freight/threads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newGroupTitle, memberIds: ids }),
      });
      const json = (await res.json()) as { id?: string; error?: string };
      if (!res.ok) throw new Error(json.error);
      setNewGroupTitle("");
      setNewGroupMembers("");
      await loadThreads();
      if (json.id) setActiveId(json.id);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Messages</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Carrier chats and dispatch groups · super dispatcher always included in groups
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab("carriers")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "carriers" ? "bg-[var(--color-accent)] text-[#05080f]" : "border border-[var(--color-border)]"}`}
          >
            Carriers
          </button>
          <button
            type="button"
            onClick={() => setTab("groups")}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "groups" ? "bg-[var(--color-accent)] text-[#05080f]" : "border border-[var(--color-border)]"}`}
          >
            Groups
          </button>
        </div>
      </div>

      {tab === "carriers" ? (
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-6">
          <p className="text-sm text-[var(--color-muted)]">
            1:1 carrier messaging lives on the Carriers page. Open a carrier to chat in a dedicated panel.
          </p>
          <Link
            href="/dispatcher/carriers"
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
          >
            <MessageSquare className="h-4 w-4" />
            Open carrier messages
          </Link>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-3">
            <p className="mb-2 text-xs font-semibold uppercase text-[var(--color-muted)]">Groups</p>
            <div className="space-y-1">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setActiveId(t.id)}
                  className={`w-full rounded-lg px-2 py-2 text-left text-xs ${activeId === t.id ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]" : "hover:bg-[var(--color-bg)]"}`}
                >
                  {t.title}
                </button>
              ))}
            </div>
            <div className="mt-4 border-t border-[var(--color-border)] pt-3">
              <p className="mb-2 flex items-center gap-1 text-xs font-semibold text-[var(--color-accent)]">
                <Plus className="h-3 w-3" /> New group
              </p>
              <input
                value={newGroupTitle}
                onChange={(e) => setNewGroupTitle(e.target.value)}
                placeholder="Group name"
                className="dispatch-field mb-2 w-full rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
              />
              <input
                value={newGroupMembers}
                onChange={(e) => setNewGroupMembers(e.target.value)}
                placeholder="Member user UUIDs (space-separated)"
                className="dispatch-field mb-2 w-full rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs"
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => void createGroup()}
                className="flex w-full items-center justify-center gap-1 rounded-lg bg-[var(--color-accent)] py-1.5 text-xs font-semibold text-[#05080f] disabled:opacity-50"
              >
                <Users className="h-3.5 w-3.5" /> Create
              </button>
            </div>
          </div>
          <div className="flex min-h-[320px] flex-col rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40">
            {activeId ? (
              <>
                <div className="flex-1 space-y-2 overflow-y-auto p-4">
                  {messages.map((m) => (
                    <div key={m.id} className="rounded-lg bg-[var(--color-bg)]/60 px-3 py-2 text-sm">
                      <span className="text-[10px] uppercase text-[var(--color-accent)]">{m.sender_role}</span>
                      <p className="text-[var(--color-text)]">{m.body}</p>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 border-t border-[var(--color-border)] p-3">
                  <input
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    className="dispatch-field flex-1 rounded-lg border border-[var(--color-border)] px-2 py-1.5 text-sm"
                    placeholder="Message group…"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void sendGroupMessage()}
                    className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
                  >
                    Send
                  </button>
                </div>
              </>
            ) : (
              <p className="p-8 text-center text-sm text-[var(--color-muted)]">Select or create a group</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
