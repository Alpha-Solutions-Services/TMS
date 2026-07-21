"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Mail, MapPin, Phone, RefreshCw, Sparkles, Upload } from "lucide-react";
import { FreightChatPanel } from "@/components/freight/FreightChatPanel";
import { InviteDriverModal } from "@/components/freight/InviteDriverModal";
import { DriverInvitationList } from "@/components/freight/DriverInvitationList";
import {
  CarrierGlassCard,
  CarrierStatusBadge,
} from "@/components/freight/carrier/CarrierGlassCard";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";
import { useCarrierDashboard } from "@/components/freight/useCarrierDashboard";

function formatUsd(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function CarrierPageShell({
  title,
  children,
  loading,
  companyName,
}: {
  title: string;
  children: React.ReactNode;
  loading?: boolean;
  companyName: string;
}) {
  return (
    <div className="min-h-screen bg-[var(--color-bg)]">
      <CarrierTopBar title={title} companyName={companyName} />
      <div className="p-4 sm:p-6 lg:p-8">
        {loading ? (
          <div className="flex items-center gap-2 text-[var(--color-muted)]">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading…
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function useCarrierPage() {
  const { data, loading, error, refresh } = useCarrierDashboard();
  return { data, loading, error, refresh, company: data?.carrier.company_name ?? "Carrier" };
}

export function CarrierLoadsPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Loads" loading={loading && !data} companyName={company}>
      {data ? (
        <CarrierGlassCard glow className="overflow-hidden p-0">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
              <tr>
                <th className="px-4 py-3 text-left">Load #</th>
                <th className="px-4 py-3 text-left">Route</th>
                <th className="px-4 py-3 text-left">Miles</th>
                <th className="px-4 py-3 text-left">Rate</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Dispatcher</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {data.loads.map((l) => (
                <tr key={l.load_id}>
                  <td className="px-4 py-3 font-medium text-[var(--color-accent)]">{l.load_number}</td>
                  <td className="px-4 py-3">
                    {l.pickup} → {l.delivery}
                  </td>
                  <td className="px-4 py-3 tabular-nums">{l.miles ?? "—"}</td>
                  <td className="px-4 py-3 text-emerald-400">{formatUsd(l.rate)}</td>
                  <td className="px-4 py-3">
                    <CarrierStatusBadge status={l.status} />
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{l.dispatcher}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CarrierGlassCard>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierTrucksPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Trucks & GPS" loading={loading && !data} companyName={company}>
      {data ? (
        <div className="grid gap-4 md:grid-cols-2">
          {data.trucks.map((t) => (
            <CarrierGlassCard key={t.truck_id} glow>
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-lg font-bold text-[var(--color-text)]">Truck #{t.truck_number}</p>
                  <p className="text-sm text-[var(--color-muted)]">{t.equipment}</p>
                </div>
                <CarrierStatusBadge status={t.status} />
              </div>
              <p className="mt-3 text-sm">
                Driver: <strong>{t.driver}</strong>
              </p>
              <p className="mt-1 flex items-center gap-1 text-sm text-[var(--color-accent)]">
                <MapPin className="h-4 w-4" />
                {t.location}
              </p>
              <p className="mt-2 text-xs text-[var(--color-muted)]">
                Live GPS · updated moments ago
              </p>
            </CarrierGlassCard>
          ))}
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierDriversPage() {
  const { data, loading, company, refresh } = useCarrierPage();
  const searchParams = useSearchParams();
  const [paidMsg, setPaidMsg] = useState<string | null>(null);

  useEffect(() => {
    const paid = searchParams.get("driver_paid");
    const name = searchParams.get("name");
    const email = searchParams.get("email");
    if (paid !== "1" || !name || !email) return;

    void (async () => {
      try {
        const res = await fetch("/api/freight/invite-driver", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ driverName: name, driverEmail: email }),
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? "Invite failed");
        setPaidMsg(`Payment received — invitation sent to ${email}.`);
        await refresh();
      } catch (e) {
        setPaidMsg(e instanceof Error ? e.message : "Could not send invite after payment");
      }
    })();
  }, [searchParams, refresh]);

  return (
    <CarrierPageShell title="Drivers" loading={loading && !data} companyName={company}>
      {paidMsg ? (
        <p className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-300">
          {paidMsg}
        </p>
      ) : null}
      {data ? (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-muted)]">Manage fleet drivers and scorecards.</p>
            <InviteDriverModal mode="carrier" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.drivers.map((d) => (
              <CarrierGlassCard key={d.driver_id}>
                <p className="font-semibold text-[var(--color-text)]">{d.name}</p>
                <p className="text-sm text-[var(--color-muted)]">{d.phone}</p>
                <div className="mt-3 flex items-center justify-between">
                  <CarrierStatusBadge status={d.status} />
                  {d.score ? (
                    <span className="text-sm text-emerald-400">Score {d.score}</span>
                  ) : null}
                </div>
              </CarrierGlassCard>
            ))}
          </div>
          <CarrierGlassCard>
            <h2 className="text-sm font-semibold text-[var(--color-text)]">Pending invitations</h2>
            <div className="mt-4">
              <DriverInvitationList />
            </div>
          </CarrierGlassCard>
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierPaymentsPage() {
  const { data, loading, company } = useCarrierPage();

  return (
    <CarrierPageShell title="Payments" loading={loading && !data} companyName={company}>
      <CarrierGlassCard glow className="mb-6">
        <p className="text-sm font-semibold text-[var(--color-text)]">Carrier portal subscription</p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          $10/month after a <strong className="text-[var(--color-text)]">7-day free trial</strong>, unless dispatch grants you free access.
          Contact dispatch to arrange payment via Zelle or bank transfer after your trial ends.
        </p>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Email{" "}
          <a href="mailto:info@alphasolutions.software" className="text-[var(--color-accent)] hover:underline">
            info@alphasolutions.software
          </a>{" "}
          to continue portal access after trial.
        </p>
      </CarrierGlassCard>
      {data ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <CarrierGlassCard glow>
            <p className="text-xs uppercase text-[var(--color-muted)]">Paid this month</p>
            <p className="mt-2 text-3xl font-bold text-emerald-400">
              {formatUsd(data.payments.paid_this_month)}
            </p>
          </CarrierGlassCard>
          <CarrierGlassCard glow>
            <p className="text-xs uppercase text-[var(--color-muted)]">Unpaid invoices</p>
            <p className="mt-2 text-3xl font-bold text-orange-300">
              {formatUsd(data.payments.unpaid_invoices)}
            </p>
          </CarrierGlassCard>
          <CarrierGlassCard>
            <p className="text-xs uppercase text-[var(--color-muted)]">YTD earnings</p>
            <p className="mt-2 text-3xl font-bold">{formatUsd(data.payments.total_earnings_ytd)}</p>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Factoring: {data.payments.factoring_status}
            </p>
          </CarrierGlassCard>
          <CarrierGlassCard className="md:col-span-2 lg:col-span-3">
            <p className="text-sm text-[var(--color-muted)]">
              Fuel expense this month:{" "}
              <strong className="text-[var(--color-text)]">
                {formatUsd(data.fuel_expense_month)}
              </strong>
            </p>
          </CarrierGlassCard>
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierInvoicesPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Invoices" loading={loading && !data} companyName={company}>
      {data ? (
        <CarrierGlassCard>
          <p className="text-sm text-[var(--color-muted)]">
            Download dispatch fee invoices from Alpha Freight Network.
          </p>
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] p-4">
              <div>
                <p className="font-medium">Outstanding balance</p>
                <p className="text-2xl font-bold text-orange-300">
                  {formatUsd(data.payments.unpaid_invoices)}
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f]"
              >
                Download invoice PDF
              </button>
            </div>
          </div>
        </CarrierGlassCard>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierDocumentsPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Documents" loading={loading && !data} companyName={company}>
      {data ? (
        <div className="space-y-6">
          <CarrierGlassCard glow className="border-dashed">
            <div className="flex flex-col items-center py-10 text-center">
              <Upload className="h-10 w-10 text-[var(--color-accent)]" />
              <p className="mt-3 font-medium text-[var(--color-text)]">Drag & drop POD / BOL</p>
              <p className="mt-1 text-sm text-[var(--color-muted)]">PDF, JPG up to 10MB</p>
              <button
                type="button"
                className="mt-4 rounded-xl border border-[var(--color-accent)]/50 px-4 py-2 text-sm text-[var(--color-accent)]"
              >
                Choose files
              </button>
            </div>
          </CarrierGlassCard>
          <div className="grid gap-3 sm:grid-cols-2">
            {data.documents.map((doc) => (
              <CarrierGlassCard key={doc.document_type}>
                <p className="font-medium">{doc.document_type}</p>
                <p className="text-sm text-[var(--color-muted)]">Expires {doc.expiration_date}</p>
                <CarrierStatusBadge status={doc.status} />
              </CarrierGlassCard>
            ))}
          </div>
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierCompliancePage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Compliance" loading={loading && !data} companyName={company}>
      {data ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            ["Insurance", data.compliance.insurance_status, data.compliance.insurance_expiry],
            ["MC Authority", data.compliance.mc_authority, data.compliance.mc_expiry],
            ["CDL", "Active", data.compliance.cdl_expiry],
            ["Registration", "Active", data.compliance.registration_expiry],
            ["IFTA filing", "Due", data.compliance.ifta_due],
          ].map(([label, status, expiry]) => (
            <CarrierGlassCard key={String(label)}>
              <p className="font-semibold text-[var(--color-text)]">{label}</p>
              <div className="mt-2 flex items-center justify-between">
                <CarrierStatusBadge status={String(status)} />
                <span className="text-sm text-[var(--color-muted)]">{expiry}</span>
              </div>
            </CarrierGlassCard>
          ))}
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierChatPage() {
  const { data, loading, company } = useCarrierPage();
  const [tab, setTab] = useState<"dispatch" | "loads">("loads");
  const [loadThreads, setLoadThreads] = useState<
    { id: string; load_id: string; title: string }[]
  >([]);
  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<
    { id: string; created_at: string; sender_role: string; body: string; attachments?: { name: string; url: string }[] }[]
  >([]);
  const [reply, setReply] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatMsg, setChatMsg] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/carrier/messages");
      const json = (await res.json()) as { messages?: typeof messages };
      if (res.ok) setMessages(json.messages ?? []);
    })();
    void (async () => {
      const res = await fetch("/api/freight/load-threads");
      if (res.ok) {
        const json = (await res.json()) as { threads?: { id: string; load_id: string; title: string }[] };
        setLoadThreads(json.threads ?? []);
        if (json.threads?.[0]) setActiveLoadId(json.threads[0].load_id);
      }
    })();
  }, []);

  async function sendReply() {
    if (!reply.trim()) return;
    setChatBusy(true);
    setChatMsg(null);
    try {
      const res = await fetch("/api/carrier/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Send failed");
      setReply("");
      const refresh = await fetch("/api/carrier/messages");
      const body = (await refresh.json()) as { messages?: typeof messages };
      setMessages(body.messages ?? []);
      setChatMsg("Message sent to dispatch.");
    } catch (e) {
      setChatMsg(e instanceof Error ? e.message : "Could not send");
    } finally {
      setChatBusy(false);
    }
  }

  return (
    <CarrierPageShell title="Chat" loading={loading && !data} companyName={company}>
      {data ? (
        <div className="space-y-4">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setTab("loads")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "loads" ? "bg-[var(--color-accent)] text-[#05080f]" : "border border-[var(--color-border)]"}`}
            >
              Load chats
            </button>
            <button
              type="button"
              onClick={() => setTab("dispatch")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${tab === "dispatch" ? "bg-[var(--color-accent)] text-[#05080f]" : "border border-[var(--color-border)]"}`}
            >
              Dispatch
            </button>
          </div>

          {tab === "loads" ? (
            <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[200px_1fr]" style={{ minHeight: "calc(100dvh - 14rem)" }}>
              <div className="space-y-1 overflow-y-auto rounded-xl border border-[var(--color-border)] p-2">
                {loadThreads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveLoadId(t.load_id)}
                    className={`w-full rounded-lg px-2 py-2 text-left text-xs ${activeLoadId === t.load_id ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]" : ""}`}
                  >
                    {t.title}
                  </button>
                ))}
              </div>
              {activeLoadId ? (
                <FreightChatPanel
                  mode="load"
                  loadId={activeLoadId}
                  title="Load team chat"
                  viewerRole="carrier"
                />
              ) : (
                <p className="text-sm text-[var(--color-muted)]">No load chats yet.</p>
              )}
            </div>
          ) : (
        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3" style={{ minHeight: "calc(100dvh - 14rem)" }}>
          <CarrierGlassCard className="flex min-h-0 flex-col lg:col-span-2" glow>
            <div className="flex min-h-0 flex-1 flex-col rounded-xl border border-[var(--color-border)] bg-[#0a1018] p-2">
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-2">
                {messages.length === 0 ? (
                  <p className="text-sm text-[var(--color-muted)]">
                    Messages from your dispatcher appear here. You also get email when dispatch writes you.
                  </p>
                ) : (
                  messages.map((m) => {
                    const own = m.sender_role === "carrier";
                    return (
                    <div
                      key={m.id}
                      className={`flex w-full ${own ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={
                          own
                            ? "max-w-[85%] rounded-2xl rounded-br-md bg-[#005c4b] px-3 py-2 text-sm text-white"
                            : "max-w-[85%] rounded-2xl rounded-bl-md bg-[var(--color-surface)] px-3 py-2 text-sm"
                        }
                      >
                      <p className="text-[10px] uppercase opacity-70">
                        {m.sender_role} · {new Date(m.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                      </div>
                    </div>
                    );
                  })
                )}
              </div>
              <div className="mt-2 flex shrink-0 gap-2 border-t border-[var(--color-border)] pt-2">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && void sendReply()}
                  placeholder="Reply to dispatch…"
                  className="dispatch-field flex-1 rounded-2xl border border-[var(--color-border)] px-4 py-2.5 text-sm"
                />
                <button
                  type="button"
                  disabled={chatBusy || !reply.trim()}
                  onClick={() => void sendReply()}
                  className="rounded-full bg-[#005c4b] px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  Send
                </button>
              </div>
              {chatMsg ? <p className="mt-2 text-xs text-[var(--color-muted)]">{chatMsg}</p> : null}
            </div>
          </CarrierGlassCard>
          <CarrierGlassCard>
            <p className="font-semibold">{data.dispatcher.name}</p>
            <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Mail className="h-4 w-4" />
              <a href={`mailto:${data.dispatcher.email}`} className="text-[var(--color-accent)]">
                {data.dispatcher.email}
              </a>
            </p>
            <p className="mt-2 flex items-center gap-2 text-sm text-[var(--color-muted)]">
              <Phone className="h-4 w-4" />
              {data.dispatcher.phone}
            </p>
          </CarrierGlassCard>
        </div>
          )}
        </div>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierSettingsPage() {
  const { data, loading, company } = useCarrierPage();
  return (
    <CarrierPageShell title="Settings" loading={loading && !data} companyName={company}>
      {data ? (
        <CarrierGlassCard className="max-w-xl">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Company</dt>
              <dd className="font-medium">{data.carrier.company_name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">MC</dt>
              <dd>{data.carrier.mc_number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">DOT</dt>
              <dd>{data.carrier.dot_number}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-[var(--color-muted)]">Owner</dt>
              <dd>{data.carrier.owner}</dd>
            </div>
          </dl>
        </CarrierGlassCard>
      ) : null}
    </CarrierPageShell>
  );
}

export function CarrierAiLoadsPanel() {
  const { data } = useCarrierPage();
  if (!data?.ai_load_recommendations.length) return null;
  return (
    <CarrierGlassCard glow className="mt-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)]">
        <Sparkles className="h-4 w-4" />
        AI load recommendations
      </p>
      {data.ai_load_recommendations.map((l) => (
        <div key={l.load_id} className="mt-3 flex justify-between text-sm">
          <span>
            {l.pickup} → {l.delivery}
          </span>
          <span className="text-emerald-400">{formatUsd(l.rate)}</span>
        </div>
      ))}
    </CarrierGlassCard>
  );
}
