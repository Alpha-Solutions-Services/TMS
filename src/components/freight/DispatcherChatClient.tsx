"use client";

import { useCallback, useEffect, useState } from "react";
import { Bot, Loader2, Truck, Users } from "lucide-react";
import { FreightAiAssistant } from "@/components/freight/FreightAiAssistant";
import { FreightChatPanel } from "@/components/freight/FreightChatPanel";

type CarrierRow = {
  profileId: string;
  companyName: string;
  email: string;
};

type LoadThread = {
  id: string;
  load_id: string;
  load_number: string;
  title: string;
};

type GroupThread = {
  id: string;
  title: string;
};

export function DispatcherChatClient() {
  const [tab, setTab] = useState<"carriers" | "loads" | "groups">("loads");
  const [carriers, setCarriers] = useState<CarrierRow[]>([]);
  const [loadThreads, setLoadThreads] = useState<LoadThread[]>([]);
  const [groupThreads, setGroupThreads] = useState<GroupThread[]>([]);
  const [activeCarrierId, setActiveCarrierId] = useState<string | null>(null);
  const [activeLoadId, setActiveLoadId] = useState<string | null>(null);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [cRes, lRes, gRes] = await Promise.all([
        fetch("/api/freight/chat/carriers"),
        fetch("/api/freight/load-threads"),
        fetch("/api/freight/threads"),
      ]);
      if (cRes.ok) {
        const c = (await cRes.json()) as { carriers?: CarrierRow[] };
        setCarriers(c.carriers ?? []);
      }
      if (lRes.ok) {
        const l = (await lRes.json()) as { threads?: LoadThread[] };
        setLoadThreads(l.threads ?? []);
      }
      if (gRes.ok) {
        const g = (await gRes.json()) as { threads?: GroupThread[] };
        setGroupThreads(g.threads ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const activeCarrier = carriers.find((c) => c.profileId === activeCarrierId);
  const activeLoad = loadThreads.find((t) => t.load_id === activeLoadId);
  const activeGroup = groupThreads.find((t) => t.id === activeGroupId);

  return (
    <div className="flex h-[calc(100vh-5rem)] flex-col p-4 md:p-6">
      <header className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Chat</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Message carriers, drivers, and load teams · attach RC, BOL, POD, PDF, images
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {(["loads", "carriers", "groups"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize ${
                tab === t ? "bg-[var(--color-accent)] text-[#05080f]" : "border border-[var(--color-border)]"
              }`}
            >
              {t === "loads" ? "Load chats" : t}
            </button>
          ))}
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[220px_1fr]">
        <aside className="overflow-y-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-2">
          {loading ? (
            <p className="flex items-center gap-2 p-3 text-xs text-[var(--color-muted)]">
              <Loader2 className="h-3 w-3 animate-spin" /> Loading…
            </p>
          ) : null}
          {tab === "loads" &&
            loadThreads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveLoadId(t.load_id)}
                className={`mb-1 flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left text-xs ${
                  activeLoadId === t.load_id
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                    : "hover:bg-[var(--color-bg)]"
                }`}
              >
                <Truck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{t.title}</span>
              </button>
            ))}
          {tab === "carriers" &&
            carriers.map((c) => (
              <button
                key={c.profileId}
                type="button"
                onClick={() => setActiveCarrierId(c.profileId)}
                className={`mb-1 flex w-full flex-col rounded-lg px-2 py-2 text-left text-xs ${
                  activeCarrierId === c.profileId
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                    : "hover:bg-[var(--color-bg)]"
                }`}
              >
                <span className="font-medium">{c.companyName}</span>
                <span className="text-[10px] opacity-70">{c.email}</span>
              </button>
            ))}
          {tab === "groups" &&
            groupThreads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveGroupId(t.id)}
                className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-xs ${
                  activeGroupId === t.id
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                    : "hover:bg-[var(--color-bg)]"
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                {t.title}
              </button>
            ))}
          {!loading && tab === "loads" && loadThreads.length === 0 ? (
            <p className="p-3 text-[10px] text-[var(--color-muted)]">
              Assign a load to a driver to open a load chat (dispatch + carrier + driver by email).
            </p>
          ) : null}
        </aside>

        <div className="flex min-h-0 flex-col gap-4">
          {tab === "loads" && activeLoadId ? (
            <FreightChatPanel
              mode="load"
              loadId={activeLoadId}
              title={activeLoad?.title}
              emptyHint="Load chat — dispatcher, carrier, and driver see this on their portal."
            />
          ) : tab === "carriers" && activeCarrierId ? (
            <FreightChatPanel
              mode="carrier"
              carrierProfileId={activeCarrierId}
              title={activeCarrier?.companyName}
              emptyHint="Carrier gets email when you message. They reply on carrier portal."
            />
          ) : tab === "groups" && activeGroupId ? (
            <FreightChatPanel
              mode="group"
              threadId={activeGroupId}
              title={activeGroup?.title}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
              Select a conversation
            </div>
          )}

          <section className="shrink-0 rounded-2xl border border-[var(--color-accent)]/30 bg-[var(--color-surface)]/50">
            <div className="flex items-center gap-2 border-b border-[var(--color-border)] px-4 py-3">
              <Bot className="h-4 w-4 text-[var(--color-accent)]" />
              <h2 className="text-sm font-semibold text-[var(--color-text)]">Alpha AI Assistant</h2>
              <span className="text-[10px] text-[var(--color-muted)]">
                Upload RC/BOL/POD to extract load data · paste load board text
              </span>
            </div>
            <div className="p-3">
              <FreightAiAssistant embedded allowFiles />
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
