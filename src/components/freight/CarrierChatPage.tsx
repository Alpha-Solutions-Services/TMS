"use client";

import { useEffect, useState } from "react";
import { Mail, Phone, RefreshCw } from "lucide-react";
import { FreightChatPanel } from "@/components/freight/FreightChatPanel";
import { CarrierGlassCard } from "@/components/freight/carrier/CarrierGlassCard";
import { CarrierTopBar } from "@/components/freight/carrier/CarrierTopBar";
import { useCarrierDashboard } from "@/components/freight/useCarrierDashboard";

function useCarrierPage() {
  const { data, loading, error, refresh } = useCarrierDashboard();
  return {
    data,
    loading,
    error,
    refresh,
    company: data?.carrier.company_name ?? "Carrier",
  };
}

export function CarrierChatPage() {
  const { data, loading, company } = useCarrierPage();
  const [tab, setTab] = useState<"dispatch" | "loads">("loads");
  const [loadThreads, setLoadThreads] = useState<
    { id: string; load_id: string; title: string }[]
  >([]);
  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [messages, setMessages] = useState<
    {
      id: string;
      created_at: string;
      sender_role: string;
      body: string;
      attachments?: { name: string; url: string }[];
    }[]
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
        const json = (await res.json()) as {
          threads?: { id: string; load_id: string; title: string }[];
        };
        setLoadThreads(json.threads ?? []);
      }
    })();
  }, []);

  const loadChatOpen = tab === "loads" && Boolean(activeLoadId);
  const dispatchChatOpen = tab === "dispatch" && dispatchOpen;
  const chatOpen = loadChatOpen || dispatchChatOpen;

  useEffect(() => {
    if (!chatOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [chatOpen]);

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

  const activeLoad = loadThreads.find((t) => t.load_id === activeLoadId);

  function switchTab(next: "dispatch" | "loads") {
    setTab(next);
    setActiveLoadId(null);
    setDispatchOpen(false);
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col bg-[var(--color-bg)]">
      <div className={chatOpen ? "max-lg:hidden" : ""}>
        <CarrierTopBar title="Chat" companyName={company} />
      </div>
      {loading && !data ? (
        <div className="flex items-center gap-2 p-4 text-[var(--color-muted)]">
          <RefreshCw className="h-4 w-4 animate-spin" />
          Loading…
        </div>
      ) : data ? (
        <div className="relative flex min-h-0 flex-1 flex-col">
          <div
            className={`flex shrink-0 gap-2 border-b border-[var(--color-border)] px-3 py-2 lg:px-8 ${
              chatOpen ? "max-lg:hidden" : ""
            }`}
          >
            <button
              type="button"
              onClick={() => switchTab("loads")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === "loads"
                  ? "bg-[var(--color-accent)] text-[#05080f]"
                  : "border border-[var(--color-border)]"
              }`}
            >
              Load chats
            </button>
            <button
              type="button"
              onClick={() => switchTab("dispatch")}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${
                tab === "dispatch"
                  ? "bg-[var(--color-accent)] text-[#05080f]"
                  : "border border-[var(--color-border)]"
              }`}
            >
              Dispatch
            </button>
          </div>

          {tab === "loads" ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[200px_1fr] lg:gap-4 lg:p-6">
              <div
                className={`space-y-1 overflow-y-auto p-2 lg:rounded-xl lg:border lg:border-[var(--color-border)] ${
                  loadChatOpen ? "max-lg:hidden" : ""
                }`}
              >
                {loadThreads.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setActiveLoadId(t.load_id)}
                    className={`w-full rounded-lg px-2 py-3 text-left text-xs lg:py-2 ${
                      activeLoadId === t.load_id
                        ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                        : "hover:bg-[var(--color-surface)]"
                    }`}
                  >
                    {t.title}
                  </button>
                ))}
                {loadThreads.length === 0 ? (
                  <p className="p-2 text-sm text-[var(--color-muted)]">No load chats yet.</p>
                ) : null}
              </div>

              <div
                className={
                  loadChatOpen
                    ? "fixed inset-0 z-[60] flex flex-col bg-[var(--color-bg)] lg:static lg:inset-auto lg:z-auto lg:bg-transparent"
                    : "hidden lg:flex lg:flex-col"
                }
              >
                {loadChatOpen ? (
                  <div className="flex shrink-0 gap-2 border-b border-[var(--color-border)] px-3 py-2 lg:hidden">
                    <button
                      type="button"
                      onClick={() => switchTab("loads")}
                      className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
                    >
                      Load chats
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTab("dispatch")}
                      className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold"
                    >
                      Dispatch
                    </button>
                  </div>
                ) : null}
                <div className="min-h-0 flex-1">
                  {activeLoadId ? (
                    <FreightChatPanel
                      mode="load"
                      loadId={activeLoadId}
                      title={activeLoad?.title ?? "Load team chat"}
                      viewerRole="carrier"
                      onBack={() => setActiveLoadId(null)}
                    />
                  ) : (
                    <p className="p-6 text-sm text-[var(--color-muted)]">Select a load chat</p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-3 lg:gap-4 lg:p-6">
              <div
                className={`p-3 lg:col-span-1 lg:p-0 ${
                  dispatchChatOpen ? "max-lg:hidden" : ""
                }`}
              >
                <button
                  type="button"
                  onClick={() => setDispatchOpen(true)}
                  className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-left lg:hidden"
                >
                  <p className="font-semibold text-[var(--color-text)]">
                    {data.dispatcher.name}
                  </p>
                  <p className="mt-1 text-xs text-[var(--color-muted)]">
                    Open dispatch chat
                  </p>
                </button>
                <CarrierGlassCard className="mt-3 hidden lg:block">
                  <p className="font-semibold">{data.dispatcher.name}</p>
                  <p className="mt-3 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                    <Mail className="h-4 w-4" />
                    <a
                      href={`mailto:${data.dispatcher.email}`}
                      className="text-[var(--color-accent)]"
                    >
                      {data.dispatcher.email}
                    </a>
                  </p>
                  <p className="mt-2 flex items-center gap-2 text-sm text-[var(--color-muted)]">
                    <Phone className="h-4 w-4" />
                    {data.dispatcher.phone}
                  </p>
                </CarrierGlassCard>
              </div>

              <div
                className={
                  dispatchChatOpen
                    ? "fixed inset-0 z-[60] flex flex-col bg-[var(--color-bg)] lg:col-span-2 lg:static lg:inset-auto lg:z-auto lg:overflow-hidden lg:rounded-2xl lg:border lg:border-[var(--color-border)]"
                    : "hidden min-h-0 flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] lg:col-span-2 lg:flex"
                }
              >
                {dispatchChatOpen ? (
                  <div className="flex shrink-0 gap-2 border-b border-[var(--color-border)] px-3 py-2 lg:hidden">
                    <button
                      type="button"
                      onClick={() => switchTab("loads")}
                      className="rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold"
                    >
                      Load chats
                    </button>
                    <button
                      type="button"
                      onClick={() => switchTab("dispatch")}
                      className="rounded-lg bg-[var(--color-accent)] px-3 py-1.5 text-xs font-semibold text-[#05080f]"
                    >
                      Dispatch
                    </button>
                  </div>
                ) : null}
                <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#0a1018]">
                  <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface)]/60 px-3 py-3">
                    <button
                      type="button"
                      onClick={() => setDispatchOpen(false)}
                      className="rounded-lg p-2 text-[var(--color-muted)] lg:hidden"
                      aria-label="Back"
                    >
                      ←
                    </button>
                    <p className="truncate text-sm font-semibold">
                      {data.dispatcher.name}
                    </p>
                  </div>
                  <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
                    {messages.length === 0 ? (
                      <p className="text-sm text-[var(--color-muted)]">
                        Messages from your dispatcher appear here.
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
                                {m.sender_role} ·{" "}
                                {new Date(m.created_at).toLocaleTimeString([], {
                                  hour: "numeric",
                                  minute: "2-digit",
                                })}
                              </p>
                              <p className="mt-1 whitespace-pre-wrap">{m.body}</p>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                  <div className="flex shrink-0 gap-2 border-t border-[var(--color-border)] p-2">
                    <input
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && !e.shiftKey && void sendReply()
                      }
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
                  {chatMsg ? (
                    <p className="px-3 pb-2 text-xs text-[var(--color-muted)]">{chatMsg}</p>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
