"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus, Ticket } from "lucide-react";
import clsx from "clsx";

type TicketRow = {
  id: string;
  subject: string;
  description: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
};

type Msg = {
  id: string;
  body: string;
  is_admin: boolean;
  is_ai: boolean;
  created_at: string;
};

export function TicketsPanel({ mode = "client" }: { mode?: "client" | "admin" }) {
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [creating, setCreating] = useState(false);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("medium");
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listUrl = mode === "admin" ? "/api/admin/tickets" : "/api/tickets";

  const load = useCallback(async () => {
    const res = await fetch(listUrl);
    const j = (await res.json()) as { tickets?: TicketRow[] };
    setTickets(j.tickets ?? []);
  }, [listUrl]);

  useEffect(() => {
    void load();
  }, [load]);

  async function openTicket(id: string) {
    setSelected(id);
    const res = await fetch(`/api/tickets/${id}`);
    const j = (await res.json()) as { messages?: Msg[] };
    setMessages(j.messages ?? []);
  }

  async function createTicket(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/tickets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, description, priority }),
      });
      const j = (await res.json()) as { error?: string; id?: string };
      if (!res.ok) throw new Error(j.error || "Failed");
      setCreating(false);
      setSubject("");
      setDescription("");
      await load();
      if (j.id) void openTicket(j.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendReply() {
    if (!selected || !reply.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/tickets/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: reply.trim() }),
      });
      if (!res.ok) throw new Error("Send failed");
      setReply("");
      await openTicket(selected);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function patchStatus(status: string) {
    if (!selected || mode !== "admin") return;
    await fetch(`/api/tickets/${selected}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/20">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] p-4">
          <h2 className="flex items-center gap-2 font-semibold text-[var(--color-text)]">
            <Ticket className="h-4 w-4 text-[var(--color-accent)]" />
            Tickets
          </h2>
          {mode === "client" ? (
            <button
              type="button"
              onClick={() => setCreating((v) => !v)}
              className="inline-flex items-center gap-1 rounded-lg bg-[var(--color-accent)] px-2.5 py-1.5 text-xs font-semibold text-[#05080f]"
            >
              <Plus className="h-3.5 w-3.5" /> New
            </button>
          ) : null}
        </div>
        <ul className="max-h-[520px] divide-y divide-[var(--color-border)] overflow-y-auto">
          {tickets.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                onClick={() => void openTicket(t.id)}
                className={clsx(
                  "w-full px-4 py-3 text-left text-sm hover:bg-[var(--color-surface)]/50",
                  selected === t.id && "bg-[var(--color-accent-dim)]/30"
                )}
              >
                <p className="font-medium text-[var(--color-text)]">{t.subject}</p>
                <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                  {t.status} · {t.priority}
                </p>
              </button>
            </li>
          ))}
          {tickets.length === 0 ? (
            <li className="p-6 text-center text-sm text-[var(--color-muted)]">
              No tickets yet.
            </li>
          ) : null}
        </ul>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/20 p-4">
        {creating && mode === "client" ? (
          <form onSubmit={(e) => void createTicket(e)} className="space-y-3">
            <h3 className="font-semibold text-[var(--color-text)]">
              New support ticket
            </h3>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Subject"
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <textarea
              required
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what you need help with…"
              rows={5}
              className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
            {error ? <p className="text-xs text-red-400">{error}</p> : null}
            <button
              type="submit"
              disabled={busy}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              {busy ? "Submitting…" : "Submit ticket"}
            </button>
          </form>
        ) : selected ? (
          <div className="flex h-[520px] flex-col">
            {mode === "admin" ? (
              <div className="mb-3 flex flex-wrap gap-2">
                {["open", "in_progress", "waiting_client", "resolved", "closed"].map(
                  (s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => void patchStatus(s)}
                      className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                    >
                      {s}
                    </button>
                  )
                )}
              </div>
            ) : null}
            <div className="flex-1 space-y-2 overflow-y-auto">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={clsx(
                    "max-w-[90%] rounded-xl px-3 py-2 text-sm",
                    m.is_admin
                      ? "ml-auto bg-[var(--color-accent)] text-[#05080f]"
                      : "mr-auto border border-[var(--color-border)]"
                  )}
                >
                  <p className="whitespace-pre-wrap">{m.body}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex gap-2 border-t border-[var(--color-border)] pt-3">
              <input
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Write a reply…"
                className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !reply.trim()}
                onClick={() => void sendReply()}
                className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send"}
              </button>
            </div>
          </div>
        ) : (
          <p className="py-16 text-center text-sm text-[var(--color-muted)]">
            Select a ticket{mode === "client" ? " or create a new one" : ""}.
          </p>
        )}
      </div>
    </div>
  );
}
