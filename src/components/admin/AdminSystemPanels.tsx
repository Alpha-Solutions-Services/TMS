"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Calendar,
  FileSignature,
  GitBranch,
  Loader2,
  Plus,
  Sparkles,
  Users,
} from "lucide-react";
import { useUi } from "@/components/ui/UiProvider";
import clsx from "clsx";

const STAGES = [
  "inquiry",
  "qualified",
  "quoted",
  "negotiation",
  "won",
  "lost",
  "on_hold",
] as const;

type Deal = {
  id: string;
  title: string;
  client_email: string | null;
  client_name: string | null;
  stage: string;
  estimated_value?: number | null;
  service_slug?: string | null;
};

export function AdminPipelinePanel() {
  const { toast } = useUi();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [form, setForm] = useState({
    title: "",
    clientEmail: "",
    clientName: "",
    serviceSlug: "web",
    estimatedValue: "",
  });
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/deals");
    const j = (await res.json()) as { deals?: Deal[] };
    setDeals(j.deals ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/deals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          clientEmail: form.clientEmail,
          clientName: form.clientName,
          serviceSlug: form.serviceSlug,
          estimatedValue: form.estimatedValue
            ? Number(form.estimatedValue)
            : undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed");
      toast({ kind: "success", title: "Deal created" });
      setForm({
        title: "",
        clientEmail: "",
        clientName: "",
        serviceSlug: "web",
        estimatedValue: "",
      });
      await load();
    } catch {
      toast({ kind: "error", title: "Could not create deal" });
    } finally {
      setBusy(false);
    }
  }

  async function setStage(id: string, stage: string) {
    const res = await fetch("/api/deals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, stage }),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Update failed" });
      return;
    }
    toast({ kind: "success", title: `Moved to ${stage}` });
    await load();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <GitBranch className="h-5 w-5 text-[var(--color-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Sales pipeline
        </h2>
      </div>

      <form
        onSubmit={(e) => void create(e)}
        className="grid gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <input
          required
          placeholder="Deal title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          required
          type="email"
          placeholder="Client email"
          value={form.clientEmail}
          onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          placeholder="Client name"
          value={form.clientName}
          onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          placeholder="Service slug"
          value={form.serviceSlug}
          onChange={(e) => setForm({ ...form, serviceSlug: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          placeholder="Est. value"
          value={form.estimatedValue}
          onChange={(e) => setForm({ ...form, estimatedValue: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-1 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add deal
        </button>
      </form>

      <div className="flex gap-3 overflow-x-auto pb-2">
        {STAGES.map((stage) => {
          const col = deals.filter((d) => d.stage === stage);
          return (
            <div
              key={stage}
              className="w-[240px] shrink-0 rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3"
            >
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                {stage.replace("_", " ")} ({col.length})
              </p>
              <ul className="space-y-2">
                {col.map((d) => (
                  <li
                    key={d.id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-3"
                  >
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {d.title}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                      {d.client_name || d.client_email}
                      {d.estimated_value != null
                        ? ` · $${Number(d.estimated_value).toLocaleString()}`
                        : ""}
                    </p>
                    <select
                      value={d.stage}
                      onChange={(e) => void setStage(d.id, e.target.value)}
                      className="mt-2 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-[11px]"
                    >
                      {STAGES.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AdminQuotesContractsPanel() {
  const { toast } = useUi();
  const [tab, setTab] = useState<"quotes" | "contracts">("quotes");
  const [quotes, setQuotes] = useState<Array<Record<string, unknown>>>([]);
  const [contracts, setContracts] = useState<Array<Record<string, unknown>>>([]);
  const [qForm, setQForm] = useState({
    title: "",
    clientEmail: "",
    description: "Project engagement",
    amount: "",
  });
  const [cForm, setCForm] = useState({
    title: "",
    clientEmail: "",
    body: "This agreement covers the scope of work discussed. By signing, the client accepts the terms and any deposit outlined below.",
    depositAmount: "",
  });

  const load = useCallback(async () => {
    const [q, c] = await Promise.all([
      fetch("/api/quotes").then((r) => r.json()),
      fetch("/api/contracts").then((r) => r.json()),
    ]);
    setQuotes(q.quotes ?? []);
    setContracts(c.contracts ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/quotes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: qForm.title,
        clientEmail: qForm.clientEmail,
        lineItems: [
          { description: qForm.description, amount: Number(qForm.amount) },
        ],
        send: true,
      }),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Quote failed" });
      return;
    }
    toast({ kind: "success", title: "Quote sent" });
    setQForm({ title: "", clientEmail: "", description: "Project engagement", amount: "" });
    await load();
  }

  async function createContract(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: cForm.title,
        clientEmail: cForm.clientEmail,
        body: cForm.body,
        depositAmount: cForm.depositAmount
          ? Number(cForm.depositAmount)
          : null,
        send: true,
      }),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Contract failed" });
      return;
    }
    toast({ kind: "success", title: "Contract sent for e-sign" });
    await load();
  }

  async function setDeposit(id: string, depositStatus: string) {
    await fetch("/api/contracts", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "set_deposit", depositStatus }),
    });
    toast({ kind: "success", title: "Deposit updated" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["quotes", "contracts"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm font-medium capitalize",
              tab === t
                ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                : "text-[var(--color-muted)]"
            )}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "quotes" ? (
        <div className="space-y-4">
          <form
            onSubmit={(e) => void createQuote(e)}
            className="grid gap-2 rounded-2xl border border-[var(--color-border)] p-4 sm:grid-cols-2"
          >
            <input
              required
              placeholder="Quote title"
              value={qForm.title}
              onChange={(e) => setQForm({ ...qForm, title: e.target.value })}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Client email"
              value={qForm.clientEmail}
              onChange={(e) =>
                setQForm({ ...qForm, clientEmail: e.target.value })
              }
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              placeholder="Line item"
              value={qForm.description}
              onChange={(e) =>
                setQForm({ ...qForm, description: e.target.value })
              }
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              required
              placeholder="Amount"
              value={qForm.amount}
              onChange={(e) => setQForm({ ...qForm, amount: e.target.value })}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f] sm:col-span-2"
            >
              Create & email quote
            </button>
          </form>
          <ul className="space-y-2">
            {quotes.map((q) => (
              <li
                key={String(q.id)}
                className="rounded-xl border border-[var(--color-border)] p-3 text-sm"
              >
                <span className="font-medium text-[var(--color-text)]">
                  {String(q.title)}
                </span>
                <span className="ml-2 text-[var(--color-muted)]">
                  {String(q.client_email)} · {String(q.status)} · $
                  {Number(q.total).toLocaleString()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="space-y-4">
          <form
            onSubmit={(e) => void createContract(e)}
            className="grid gap-2 rounded-2xl border border-[var(--color-border)] p-4"
          >
            <div className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <FileSignature className="h-4 w-4" /> E-sign contract + deposit
            </div>
            <input
              required
              placeholder="Contract title"
              value={cForm.title}
              onChange={(e) => setCForm({ ...cForm, title: e.target.value })}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              required
              type="email"
              placeholder="Client email"
              value={cForm.clientEmail}
              onChange={(e) =>
                setCForm({ ...cForm, clientEmail: e.target.value })
              }
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <textarea
              required
              rows={5}
              value={cForm.body}
              onChange={(e) => setCForm({ ...cForm, body: e.target.value })}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <input
              placeholder="Deposit amount (optional)"
              value={cForm.depositAmount}
              onChange={(e) =>
                setCForm({ ...cForm, depositAmount: e.target.value })
              }
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
            >
              Send for signature
            </button>
          </form>
          <ul className="space-y-2">
            {contracts.map((c) => (
              <li
                key={String(c.id)}
                className="rounded-xl border border-[var(--color-border)] p-3 text-sm"
              >
                <p className="font-medium text-[var(--color-text)]">
                  {String(c.title)} — {String(c.status)}
                </p>
                <p className="text-xs text-[var(--color-muted)]">
                  Deposit: {String(c.deposit_status)}
                  {c.deposit_amount != null
                    ? ` ($${Number(c.deposit_amount)})`
                    : ""}
                </p>
                <select
                  className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                  value={String(c.deposit_status)}
                  onChange={(e) =>
                    void setDeposit(String(c.id), e.target.value)
                  }
                >
                  <option value="not_required">not_required</option>
                  <option value="pending">pending</option>
                  <option value="paid">paid</option>
                  <option value="waived">waived</option>
                  <option value="refunded">refunded</option>
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AdminSchedulePanel() {
  const { toast } = useUi();
  const [slots, setSlots] = useState<Array<Record<string, unknown>>>([]);
  const [bookings, setBookings] = useState<Array<Record<string, unknown>>>([]);
  const [calComUrl, setCalComUrl] = useState<string | null>(null);
  const [form, setForm] = useState({
    startsAt: "",
    endsAt: "",
    kind: "demo",
  });
  const [adminBook, setAdminBook] = useState({
    clientEmail: "",
    startsAt: "",
    endsAt: "",
    kind: "kickoff",
    meetingUrl: "",
  });

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

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create_slot",
        startsAt: new Date(form.startsAt).toISOString(),
        endsAt: new Date(form.endsAt).toISOString(),
        kind: form.kind,
      }),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Slot failed" });
      return;
    }
    toast({ kind: "success", title: "Slot published" });
    await load();
  }

  async function bookForClient(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/bookings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "admin_book",
        clientEmail: adminBook.clientEmail,
        startsAt: new Date(adminBook.startsAt).toISOString(),
        endsAt: new Date(adminBook.endsAt).toISOString(),
        kind: adminBook.kind,
        meetingUrl: adminBook.meetingUrl || null,
      }),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Booking failed" });
      return;
    }
    toast({ kind: "success", title: "Meeting booked & emailed" });
    await load();
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
            className="text-sm text-[var(--color-accent)] hover:underline"
          >
            Open Cal.com
          </a>
        ) : (
          <p className="text-xs text-[var(--color-muted)]">
            Set NEXT_PUBLIC_CAL_COM_URL for Cal.com link
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => void addSlot(e)}
        className="grid gap-2 rounded-2xl border border-[var(--color-border)] p-4 sm:grid-cols-4"
      >
        <input
          required
          type="datetime-local"
          value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          required
          type="datetime-local"
          value={form.endsAt}
          onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <select
          value={form.kind}
          onChange={(e) => setForm({ ...form, kind: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        >
          <option value="demo">Demo</option>
          <option value="kickoff">Kickoff</option>
          <option value="review">Review</option>
        </select>
        <button
          type="submit"
          className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
        >
          Publish slot
        </button>
      </form>

      <form
        onSubmit={(e) => void bookForClient(e)}
        className="grid gap-2 rounded-2xl border border-[var(--color-border)] p-4 sm:grid-cols-2"
      >
        <p className="text-sm text-[var(--color-muted)] sm:col-span-2">
          Book directly for a client
        </p>
        <input
          required
          type="email"
          placeholder="Client email"
          value={adminBook.clientEmail}
          onChange={(e) =>
            setAdminBook({ ...adminBook, clientEmail: e.target.value })
          }
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <select
          value={adminBook.kind}
          onChange={(e) => setAdminBook({ ...adminBook, kind: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        >
          <option value="demo">Demo</option>
          <option value="kickoff">Kickoff</option>
          <option value="review">Review</option>
        </select>
        <input
          required
          type="datetime-local"
          value={adminBook.startsAt}
          onChange={(e) =>
            setAdminBook({ ...adminBook, startsAt: e.target.value })
          }
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          required
          type="datetime-local"
          value={adminBook.endsAt}
          onChange={(e) =>
            setAdminBook({ ...adminBook, endsAt: e.target.value })
          }
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          placeholder="Meeting URL"
          value={adminBook.meetingUrl}
          onChange={(e) =>
            setAdminBook({ ...adminBook, meetingUrl: e.target.value })
          }
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm sm:col-span-2"
        />
        <button
          type="submit"
          className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-accent)] sm:col-span-2"
        >
          Book & notify client
        </button>
      </form>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
            Open slots ({slots.length})
          </h3>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            {slots.map((s) => (
              <li
                key={String(s.id)}
                className="rounded-lg border border-[var(--color-border)] p-2"
              >
                {String(s.kind)} · {new Date(String(s.starts_at)).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
            Bookings ({bookings.length})
          </h3>
          <ul className="space-y-2 text-sm text-[var(--color-muted)]">
            {bookings.map((b) => (
              <li
                key={String(b.id)}
                className="rounded-lg border border-[var(--color-border)] p-2"
              >
                {String(b.client_email)} · {String(b.kind)} ·{" "}
                {new Date(String(b.starts_at)).toLocaleString()}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function AdminKnowledgePanel() {
  const { toast } = useUi();
  const [articles, setArticles] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    category: "sop",
    question: "",
    answer: "",
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/knowledge");
    const j = await res.json();
    setArticles(j.articles ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/knowledge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    if (!res.ok) {
      toast({ kind: "error", title: "Save failed" });
      return;
    }
    toast({ kind: "success", title: "FAQ added — Assistant will use it" });
    setForm({ category: "sop", question: "", answer: "" });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-[var(--color-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Knowledge / SOPs
        </h2>
      </div>
      <p className="text-sm text-[var(--color-muted)]">
        Train Alpha Assistant with your FAQs and operating procedures.
      </p>
      <form
        onSubmit={(e) => void save(e)}
        className="grid gap-2 rounded-2xl border border-[var(--color-border)] p-4"
      >
        <input
          placeholder="Category"
          value={form.category}
          onChange={(e) => setForm({ ...form, category: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <input
          required
          placeholder="Question"
          value={form.question}
          onChange={(e) => setForm({ ...form, question: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <textarea
          required
          rows={4}
          placeholder="Answer / SOP"
          value={form.answer}
          onChange={(e) => setForm({ ...form, answer: e.target.value })}
          className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
        >
          Add to knowledge base
        </button>
      </form>
      <ul className="space-y-2">
        {articles.map((a) => (
          <li
            key={String(a.id)}
            className="rounded-xl border border-[var(--color-border)] p-3"
          >
            <p className="text-xs uppercase text-[var(--color-accent)]">
              {String(a.category)}
            </p>
            <p className="font-medium text-[var(--color-text)]">
              {String(a.question)}
            </p>
            <p className="mt-1 line-clamp-3 text-sm text-[var(--color-muted)]">
              {String(a.answer)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function AdminReportsPanel() {
  const [data, setData] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    void fetch("/api/reports")
      .then((r) => r.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-[var(--color-accent)]" />
      </div>
    );
  }

  const cards = [
    ["Open tickets", data.openTickets],
    ["Avg response (hrs)", data.avgResponseHours ?? "—"],
    ["Upcoming bookings", data.bookingsUpcoming],
    ["Contracts pending", data.contractsPending],
    ["Quotes awaiting", data.quotesOpen],
    ["Pipeline value", data.pipelineValue != null ? `$${Number(data.pipelineValue).toLocaleString()}` : "Owner only"],
  ] as const;

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-[var(--color-text)]">
        Reporting
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(([label, val]) => (
          <div
            key={label}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5"
          >
            <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">
              {label}
            </p>
            <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">
              {String(val)}
            </p>
          </div>
        ))}
      </div>
      {data.revenueVisible ? (
        <div className="rounded-2xl border border-[var(--color-border)] p-5">
          <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
            Won revenue by service
          </h3>
          <ul className="space-y-2">
            {((data.revenueByService as Array<{ service: string; value: number }>) ||
              []).map((r) => (
              <li
                key={r.service}
                className="flex justify-between text-sm text-[var(--color-muted)]"
              >
                <span>{r.service}</span>
                <span className="font-semibold text-[var(--color-text)]">
                  ${r.value.toLocaleString()}
                </span>
              </li>
            ))}
            {!(data.revenueByService as unknown[])?.length ? (
              <li className="text-sm text-[var(--color-muted)]">
                Mark deals as won with estimated value to see revenue.
              </li>
            ) : null}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">
          Revenue totals are visible to owners only.
        </p>
      )}
      <div className="rounded-2xl border border-[var(--color-border)] p-5">
        <h3 className="mb-3 text-sm font-semibold text-[var(--color-text)]">
          Deals by stage
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(
            (data.dealsByStage as Record<string, number>) || {}
          ).map(([k, v]) => (
            <span
              key={k}
              className="rounded-full border border-[var(--color-border)] px-3 py-1 text-xs text-[var(--color-muted)]"
            >
              {k}: {v}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminStaffPanel() {
  const { toast } = useUi();
  const [me, setMe] = useState<{ role?: string; isOwner?: boolean; email?: string } | null>(null);
  const [staff, setStaff] = useState<Array<Record<string, unknown>>>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("staff");

  const load = useCallback(async () => {
    const res = await fetch("/api/staff");
    const j = await res.json();
    setMe(j.me);
    setStaff(j.staff ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, role }),
    });
    const j = await res.json();
    if (!res.ok) {
      toast({ kind: "error", title: j.error || "Failed" });
      return;
    }
    toast({
      kind: "success",
      title: "Staff saved",
      message: j.hint,
    });
    setEmail("");
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Users className="h-5 w-5 text-[var(--color-accent)]" />
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Roles & staff
        </h2>
      </div>
      <p className="text-sm text-[var(--color-muted)]">
        You: {me?.email} · role <strong>{me?.role || "—"}</strong>
        {me?.isOwner ? " (owner)" : ""}
      </p>
      {me?.isOwner ? (
        <form
          onSubmit={(e) => void invite(e)}
          className="flex flex-col gap-2 sm:flex-row"
        >
          <input
            required
            type="email"
            placeholder="staff@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="flex-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          >
            <option value="staff">staff</option>
            <option value="owner">owner</option>
          </select>
          <button
            type="submit"
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
          >
            Add
          </button>
        </form>
      ) : (
        <p className="text-sm text-[var(--color-muted)]">
          Only owners can invite staff. Set OWNER_EMAILS in env.
        </p>
      )}
      <ul className="space-y-2">
        {staff.map((s) => (
          <li
            key={String(s.id)}
            className="flex justify-between rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <span className="text-[var(--color-text)]">{String(s.email)}</span>
            <span className="text-[var(--color-muted)]">{String(s.role)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
