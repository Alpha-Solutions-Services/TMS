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
  const [listReady, setListReady] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/freight/load-threads");
    if (res.ok) {
      const json = (await res.json()) as { threads?: LoadThread[] };
      const list = json.threads ?? [];
      setThreads(list);
      if (loadParam && list.some((t) => t.load_id === loadParam)) {
        setActiveLoadId(loadParam);
      }
      // Desktop-only auto-select first thread; mobile stays on list
      else if (
        typeof window !== "undefined" &&
        window.matchMedia("(min-width: 1024px)").matches &&
        list[0] &&
        !activeLoadId
      ) {
        setActiveLoadId(list[0].load_id);
      }
    }
    setListReady(true);
  }, [loadParam, activeLoadId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const active = threads.find((t) => t.load_id === activeLoadId);
  const chatOpen = Boolean(activeLoadId);

  function closeChat() {
    setActiveLoadId(null);
  }

  return (
    <div className="flex h-[calc(100dvh-5rem)] flex-col">
      <header
        className={`shrink-0 px-3 pt-3 sm:px-4 sm:pt-4 md:px-6 ${
          chatOpen ? "hidden lg:block" : ""
        }`}
      >
        <h1 className="mb-1 text-lg font-bold text-[var(--color-text)] sm:text-xl">
          Load chat
        </h1>
        <p className="mb-3 text-xs text-[var(--color-muted)] sm:mb-4 sm:text-sm">
          Chat with dispatch and carrier · send BOL, POD, photos
        </p>
      </header>

      <div className="grid min-h-0 flex-1 gap-0 px-0 lg:grid-cols-[220px_1fr] lg:gap-4 lg:px-6 lg:pb-4">
        <aside
          className={`overflow-y-auto border-[var(--color-border)] p-2 lg:rounded-xl lg:border ${
            chatOpen ? "hidden lg:block" : "block"
          }`}
        >
          <div className="flex flex-col gap-1">
            {threads.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveLoadId(t.load_id)}
                className={`w-full rounded-lg px-3 py-3 text-left text-xs lg:py-2 ${
                  activeLoadId === t.load_id
                    ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                    : "hover:bg-[var(--color-surface)]"
                }`}
              >
                {t.title}
              </button>
            ))}
          </div>
          {listReady && threads.length === 0 ? (
            <p className="p-2 text-[10px] text-[var(--color-muted)]">
              No assigned load chats yet. Ask dispatch to assign a load to you.
            </p>
          ) : null}
        </aside>

        <div
          className={`min-h-0 min-w-0 flex-1 ${
            chatOpen ? "flex flex-col" : "hidden lg:flex"
          }`}
        >
          {activeLoadId ? (
            <FreightChatPanel
              mode="load"
              loadId={activeLoadId}
              title={active?.title}
              viewerRole="driver"
              onBack={closeChat}
              emptyHint="Message dispatch and carrier. Attach BOL or POD when delivered."
            />
          ) : (
            <div className="hidden h-full items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)] lg:flex">
              Select a load
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
