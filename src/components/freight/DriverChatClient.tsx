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
    <div className="flex h-[calc(100dvh-5rem)] flex-col p-3 sm:p-4 md:p-6">
      <h1 className="mb-1 text-lg font-bold text-[var(--color-text)] sm:text-xl">Load chat</h1>
      <p className="mb-3 text-xs text-[var(--color-muted)] sm:mb-4 sm:text-sm">
        Chat with dispatch and carrier · send BOL, POD, photos
      </p>
      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[220px_1fr] lg:gap-4">
        <aside className="max-h-36 shrink-0 space-y-1 overflow-x-auto overflow-y-auto rounded-xl border border-[var(--color-border)] p-2 lg:max-h-none">
          <div className="flex gap-2 lg:flex-col">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveLoadId(t.load_id)}
                className={`shrink-0 rounded-lg px-3 py-2 text-left text-xs lg:w-full ${
                  activeLoadId === t.load_id
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                    : "hover:bg-[var(--color-surface)]"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
          {threads.length === 0 ? (
            <p className="p-2 text-[10px] text-[var(--color-muted)]">
              No assigned load chats yet. Ask dispatch to assign a load to you.
            </p>
          ) : null}
        </aside>
        {activeLoadId ? (
          <div className="min-h-0 min-w-0 flex-1">
            <FreightChatPanel
              mode="load"
              loadId={activeLoadId}
              title={active?.title}
              viewerRole="driver"
              emptyHint="Message dispatch and carrier. Attach BOL or POD when delivered."
            />
          </div>
        ) : (
          <div className="flex min-h-[40vh] items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">
            Select a load
          </div>
        )}
      </div>
    </div>
  );
}
