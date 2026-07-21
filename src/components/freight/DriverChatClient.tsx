"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FreightChatPanel } from "@/components/freight/FreightChatPanel";

type LoadThread = {
  id: string;
  load_id: string;
  load_number: string;
  title: string;
};

export function DriverChatClient() {
  const searchParams = useSearchParams();
  const loadParam = searchParams.get("load");
  const [threads, setThreads] = useState<LoadThread[]>([]);
  const [activeLoadId, setActiveLoadId] = useState<string | null>(loadParam);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/freight/load-threads");
    if (res.ok) {
      const json = (await res.json()) as { threads?: LoadThread[] };
      setThreads(json.threads ?? []);
      if (loadParam && json.threads?.some((t) => t.load_id === loadParam)) {
        setActiveLoadId(loadParam);
      } else if (json.threads?.[0] && !activeLoadId) {
        setActiveLoadId(json.threads[0].load_id);
      }
    }
  }, [loadParam, activeLoadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = threads.find((t) => t.load_id === activeLoadId);

  return (
    <div className="flex h-[calc(100vh-0px)] flex-col p-4 md:p-6">
      <h1 className="mb-4 text-xl font-bold text-[var(--color-text)]">Load chat</h1>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Chat with dispatch and carrier for your assigned loads · send BOL, POD, photos
      </p>
      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[200px_1fr]">
        <aside className="space-y-1 overflow-y-auto rounded-xl border border-[var(--color-border)] p-2">
          {threads.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveLoadId(t.load_id)}
              className={`w-full rounded-lg px-2 py-2 text-left text-xs ${
                activeLoadId === t.load_id
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "hover:bg-[var(--color-surface)]"
              }`}
            >
              {t.title}
            </button>
          ))}
          {threads.length === 0 ? (
            <p className="p-2 text-[10px] text-[var(--color-muted)]">No assigned load chats yet.</p>
          ) : null}
        </aside>
        {activeLoadId ? (
          <FreightChatPanel
            mode="load"
            loadId={activeLoadId}
            title={active?.title}
            emptyHint="Message dispatch and carrier. Attach BOL or POD when delivered."
          />
        ) : (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
            Select a load
          </div>
        )}
      </div>
    </div>
  );
}
