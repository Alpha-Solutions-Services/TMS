"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Calendar, FileSignature, Loader2 } from "lucide-react";
import { useUiOptional } from "@/components/ui/UiProvider";

export function ClientQuotesPanel() {
  const ui = useUiOptional();
  const [quotes, setQuotes] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const res = await fetch("/api/quotes");
    const j = await res.json();
    setQuotes(j.quotes ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function respond(id: string, action: "accept" | "decline") {
    const res = await fetch("/api/quotes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    if (!res.ok) {
      ui?.toast({ kind: "error", title: "Could not respond" });
      return;
    }
    ui?.toast({
      kind: "success",
      title: action === "accept" ? "Quote accepted" : "Quote declined",
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">Quotes</h2>
      {quotes.length === 0 ? (
        <p className="text-sm text-[var(--color-muted)]">
          Quotes from Alpha Solutions will appear here.
        </p>
      ) : (
        quotes.map((q) => (
          <div
            key={String(q.id)}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[var(--color-text)]">
                  {String(q.title)}
                </p>
                <p className="text-sm text-[var(--color-muted)]">
                  ${Number(q.total).toLocaleString()} · {String(q.status)}
                </p>
              </div>
              {q.status === "sent" ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void respond(String(q.id), "accept")}
                    className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    onClick={() => void respond(String(q.id), "decline")}
                    className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)]"
                  >
                    Decline
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export function ClientSchedulePanel() {
  const ui = useUiOptional();
  const [slots, setSlots] = useState<Array<Record<string, unknown>>>([]);
  const [bookings, setBookings] = useState<Array<Record<string, unknown>>>([]);
  const [calComUrl, setCalComUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/bookings");
    const j = await res.json();
    setSlots(j.slots ?? []);
    setBookings(j.bookings ?? []);
    setCalComUrl(j.calComUrl ?? null);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function book(slotId: string) {
    setBusy(slotId);
    try {
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "book", slotId }),
      });
      if (!res.ok) throw new Error("failed");
      ui?.toast({ kind: "success", title: "Meeting booked" });
      await load();
    } catch {
      ui?.toast({ kind: "error", title: "Could not book slot" });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-[var(--color-accent)]" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Schedule
          </h2>
        </div>
        {calComUrl ? (
          <a
            href={calComUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
          >
            Book on Cal.com
          </a>
        ) : null}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
          Available slots
        </h3>
        <ul className="space-y-2">
          {slots.length === 0 ? (
            <li className="text-sm text-[var(--color-muted)]">
              No open slots right now
              {calComUrl ? " — use Cal.com above." : "."}
            </li>
          ) : (
            slots.map((s) => (
              <li
                key={String(s.id)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] p-3"
              >
                <span className="text-sm text-[var(--color-text)]">
                  {String(s.kind)} ·{" "}
                  {new Date(String(s.starts_at)).toLocaleString()}
                </span>
                <button
                  type="button"
                  disabled={busy === String(s.id)}
                  onClick={() => void book(String(s.id))}
                  className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f] disabled:opacity-50"
                >
                  {busy === String(s.id) ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    "Book"
                  )}
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
          Your meetings
        </h3>
        <ul className="space-y-2 text-sm text-[var(--color-muted)]">
          {bookings.map((b) => (
            <li
              key={String(b.id)}
              className="rounded-xl border border-[var(--color-border)] p-3"
            >
              {String(b.kind)} · {new Date(String(b.starts_at)).toLocaleString()}
              {b.meeting_url ? (
                <>
                  {" · "}
                  <a
                    href={String(b.meeting_url)}
                    className="text-[var(--color-accent)]"
                    target="_blank"
                    rel="noreferrer"
                  >
                    Join
                  </a>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ClientContractsPanel() {
  const ui = useUiOptional();
  const searchParams = useSearchParams();
  const signToken = searchParams.get("sign");
  const [contracts, setContracts] = useState<Array<Record<string, unknown>>>([]);
  const [signName, setSignName] = useState("");
  const [active, setActive] = useState<Record<string, unknown> | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/contracts");
    const j = await res.json();
    setContracts(j.contracts ?? []);
    if (signToken) {
      const tr = await fetch(`/api/contracts?token=${encodeURIComponent(signToken)}`);
      const tj = await tr.json();
      if (tj.contract) setActive(tj.contract);
    }
  }, [signToken]);

  useEffect(() => {
    void load();
  }, [load]);

  async function sign(action: "sign" | "decline") {
    if (!active) return;
    if (action === "sign" && signName.trim().length < 2) {
      ui?.toast({ kind: "error", title: "Enter your full name to sign" });
      return;
    }
    const res = await fetch("/api/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: active.id,
        action,
        signedName: signName,
        token: signToken || undefined,
      }),
    });
    if (!res.ok) {
      ui?.toast({ kind: "error", title: "Action failed" });
      return;
    }
    ui?.toast({
      kind: "success",
      title: action === "sign" ? "Contract signed" : "Contract declined",
    });
    setActive(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <FileSignature className="h-5 w-5 text-[var(--color-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Contracts
        </h2>
      </div>

      {active ? (
        <div className="rounded-2xl border border-[var(--color-border-glow)] bg-[var(--color-surface)]/40 p-5">
          <h3 className="text-lg font-semibold text-[var(--color-text)]">
            {String(active.title)}
          </h3>
          <p className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-[var(--color-muted)]">
            {String(active.body)}
          </p>
          {active.deposit_amount != null ? (
            <p className="mt-3 text-sm text-[var(--color-accent)]">
              Deposit: ${Number(active.deposit_amount)} (
              {String(active.deposit_status)})
            </p>
          ) : null}
          {active.status !== "signed" && active.status !== "declined" ? (
            <div className="mt-4 space-y-2">
              <input
                placeholder="Type your full name to sign"
                value={signName}
                onChange={(e) => setSignName(e.target.value)}
                className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void sign("sign")}
                  className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
                >
                  Sign electronically
                </button>
                <button
                  type="button"
                  onClick={() => void sign("decline")}
                  className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)]"
                >
                  Decline
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-emerald-400">
              Status: {String(active.status)}
            </p>
          )}
        </div>
      ) : null}

      <ul className="space-y-2">
        {contracts.map((c) => (
          <li key={String(c.id)}>
            <button
              type="button"
              onClick={() => setActive(c)}
              className="w-full rounded-xl border border-[var(--color-border)] p-3 text-left hover:border-[var(--color-accent)]/40"
            >
              <p className="font-medium text-[var(--color-text)]">
                {String(c.title)}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {String(c.status)}
                {c.deposit_amount != null
                  ? ` · deposit ${String(c.deposit_status)}`
                  : ""}
              </p>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
