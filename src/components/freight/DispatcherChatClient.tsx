"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Truck, Users } from "lucide-react";
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
    <div className="flex h-[calc(100dvh-4rem)] flex-col">
      <header className="shrink-0 border-b border-[var(--color-border)] px-4 py-3 md:px-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Chat</h1>
        <p className="text-xs text-[var(--color-muted)]">
          Full-screen messaging · toggle Ask Alpha AI inside any thread to analyze the conversation
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
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

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[240px_1fr]">
        <aside className="overflow-y-auto border-b border-[var(--color-border)] p-2 lg:border-b-0 lg:border-r">
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
              Assign a load to open a load chat (dispatch + carrier + driver).
            </p>
          ) : null}
        </aside>

        <div className="min-h-0 p-2 md:p-4">
          {tab === "loads" && activeLoadId ? (
            <FreightChatPanel
              mode="load"
              loadId={activeLoadId}
              title={activeLoad?.title}
              enableAiAssist
              emptyHint="Load chat — use Ask Alpha AI to summarize, draft replies, or parse load details from the thread."
            />
          ) : tab === "carriers" && activeCarrierId ? (
            <FreightChatPanel
              mode="carrier"
              carrierProfileId={activeCarrierId}
              title={activeCarrier?.companyName}
              enableAiAssist
              emptyHint="Carrier chat — Ask Alpha AI about this carrier conversation."
            />
          ) : tab === "groups" && activeGroupId ? (
            <FreightChatPanel
              mode="group"
              threadId={activeGroupId}
              title={activeGroup?.title}
              enableAiAssist
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
              Select a conversation
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
