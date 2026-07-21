"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Loader2, MessageSquare, Save, Shield } from "lucide-react";

type ManagedCarrier = {
  id: string;
  email: string | null;
  full_name: string | null;
  company_name: string | null;
  phone: string | null;
  mc_number: string | null;
  dot_number: string | null;
  company_address: string | null;
  carrier_status: string | null;
  carrier_subscription_status: string | null;
  carrier_trial_ends_at: string | null;
  carrier_billing_mode: string | null;
  carrier_billing_note: string | null;
};

type Message = {
  id: string;
  created_at: string;
  sender_role: string;
  body: string;
};

export function DispatcherCarrierManage() {
  const [carriers, setCarriers] = useState<ManagedCarrier[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [chatText, setChatText] = useState("");

  const [form, setForm] = useState({
    companyName: "",
    fullName: "",
    phone: "",
    mcNumber: "",
    dotNumber: "",
    companyAddress: "",
    carrierStatus: "verified",
    billingMode: "standard",
    billingNote: "",
    extendTrialDays: "7",
  });

  const loadCarriers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/dispatcher/carriers/manage");
      const json = (await res.json()) as { carriers?: ManagedCarrier[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setCarriers(json.carriers ?? []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not load carriers");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMessages = useCallback(async (carrierId: string) => {
    if (!carrierId) return;
    const res = await fetch(
      `/api/dispatcher/carriers/messages?carrierProfileId=${encodeURIComponent(carrierId)}`,
    );
    const json = (await res.json()) as { messages?: Message[] };
    setMessages(json.messages ?? []);
  }, []);

  useEffect(() => {
    void loadCarriers();
  }, [loadCarriers]);

  useEffect(() => {
    if (!selectedId && carriers[0]) setSelectedId(carriers[0].id);
  }, [carriers, selectedId]);

  useEffect(() => {
    const c = carriers.find((x) => x.id === selectedId);
    if (!c) return;
    setForm({
      companyName: c.company_name ?? "",
      fullName: c.full_name ?? "",
      phone: c.phone ?? "",
      mcNumber: c.mc_number ?? "",
      dotNumber: c.dot_number ?? "",
      companyAddress: c.company_address ?? "",
      carrierStatus: c.carrier_status ?? "verified",
      billingMode: c.carrier_billing_mode === "free" ? "free" : "standard",
      billingNote: c.carrier_billing_note ?? "",
      extendTrialDays: "7",
    });
    void loadMessages(c.id);
  }, [selectedId, carriers, loadMessages]);

  const selected = carriers.find((c) => c.id === selectedId);

  async function saveCarrier() {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/carriers/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrierProfileId: selectedId,
          companyName: form.companyName,
          fullName: form.fullName,
          phone: form.phone,
          mcNumber: form.mcNumber,
          dotNumber: form.dotNumber,
          companyAddress: form.companyAddress,
          carrierStatus: form.carrierStatus,
          billingMode: form.billingMode,
          billingNote: form.billingNote,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Save failed");
      setMsg("Carrier updated.");
      await loadCarriers();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function extendTrial() {
    if (!selectedId) return;
    setBusy(true);
    setMsg(null);
    try {
      const days = Number.parseInt(form.extendTrialDays, 10) || 7;
      const res = await fetch("/api/dispatcher/carriers/manage", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          carrierProfileId: selectedId,
          extendTrialDays: days,
          billingMode: "standard",
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setMsg(`Extended trial by ${days} days — carrier must subscribe after.`);
      await loadCarriers();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function sendMessage() {
    if (!selectedId || !chatText.trim()) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/carriers/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ carrierProfileId: selectedId, message: chatText.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      setChatText("");
      setMsg("Message sent — carrier emailed and can read in portal chat.");
      await loadMessages(selectedId);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Send failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <p className="flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" />
        Loading carrier admin…
      </p>
    );
  }

  return (
    <section className="rounded-3xl border border-[var(--color-accent)]/25 bg-[var(--color-surface)]/40 p-5 sm:p-8">
      <div className="flex flex-wrap items-center gap-2">
        <Shield className="h-5 w-5 text-[var(--color-accent)]" />
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Super admin — carrier control
        </h2>
      </div>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Edit carrier info, grant free portal access or require $10/mo subscription, and send messages with email alerts.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <label className="block text-xs text-[var(--color-muted)]">Carrier</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            {carriers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.company_name || c.full_name || c.email}
              </option>
            ))}
          </select>
          {selected ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              {selected.email} · {selected.carrier_status} ·{" "}
              {selected.carrier_billing_mode === "free" ? (
                <span className="text-emerald-400">Free access</span>
              ) : (
                selected.carrier_subscription_status ?? "standard"
              )}
            </p>
          ) : null}
        </div>

        <div className="space-y-3 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-2">
            {(
              [
                ["companyName", "Company name"],
                ["fullName", "Contact name"],
                ["phone", "Phone"],
                ["mcNumber", "MC #"],
                ["dotNumber", "DOT #"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-sm">
                <span className="text-[var(--color-muted)]">{label}</span>
                <input
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                  className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
                />
              </label>
            ))}
          </div>
          <label className="block text-sm">
            <span className="text-[var(--color-muted)]">Address</span>
            <input
              value={form.companyAddress}
              onChange={(e) => setForm((f) => ({ ...f, companyAddress: e.target.value }))}
              className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Status</span>
              <select
                value={form.carrierStatus}
                onChange={(e) => setForm((f) => ({ ...f, carrierStatus: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <option value="verified">Verified</option>
                <option value="suspended">Suspended</option>
                <option value="pending">Pending</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Portal billing</span>
              <select
                value={form.billingMode}
                onChange={(e) => setForm((f) => ({ ...f, billingMode: e.target.value }))}
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                <option value="standard">Standard billing ($10/mo after trial)</option>
                <option value="free">Free access (comped)</option>
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-[var(--color-muted)]">Billing note</span>
              <input
                value={form.billingNote}
                onChange={(e) => setForm((f) => ({ ...f, billingNote: e.target.value }))}
                placeholder="Internal note"
                className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void saveCarrier()}
              className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              Save carrier
            </button>
            <button
              type="button"
              disabled={busy || form.billingMode === "free"}
              onClick={() => void extendTrial()}
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm disabled:opacity-50"
            >
              Extend trial ({form.extendTrialDays}d)
            </button>
          </div>
        </div>
      </div>

      <div className="mt-8 border-t border-[var(--color-border)] pt-6">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-4 w-4 text-[var(--color-accent)]" />
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Message carrier</h3>
        </div>
        <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 p-3">
          {messages.length === 0 ? (
            <p className="text-xs text-[var(--color-muted)]">No messages yet.</p>
          ) : (
            messages.map((m) => (
              <div
                key={m.id}
                className={clsx(
                  "mb-2 rounded-lg px-3 py-2 text-sm",
                  m.sender_role === "dispatcher"
                    ? "ml-4 bg-[var(--color-accent-dim)] text-[var(--color-text)]"
                    : "mr-4 bg-[var(--color-surface)] text-[var(--color-muted)]",
                )}
              >
                <p className="text-[10px] uppercase text-[var(--color-muted)]">
                  {m.sender_role} · {new Date(m.created_at).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
              </div>
            ))
          )}
        </div>
        <textarea
          value={chatText}
          onChange={(e) => setChatText(e.target.value)}
          rows={3}
          placeholder="Type a message — carrier gets email + portal notification"
          className="dispatch-field mt-3 w-full rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
        />
        <button
          type="button"
          disabled={busy || !chatText.trim()}
          onClick={() => void sendMessage()}
          className="mt-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
        >
          Send message
        </button>
      </div>

      {msg ? <p className="mt-4 text-sm text-[var(--color-muted)]">{msg}</p> : null}
    </section>
  );
}
