"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Bell, Mail } from "lucide-react";
import { PortalClock } from "@/components/freight/PortalClock";

type AlertItem = {
  id: string;
  title: string;
  body: string;
  href: string;
  kind: "announcement" | "document";
};

export function CarrierTopBar({
  title,
  companyName = "Carrier",
}: {
  title: string;
  companyName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<AlertItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const loadAlerts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/freight/carrier/alerts", { cache: "no-store" });
      const json = (await res.json()) as {
        count?: number;
        items?: AlertItem[];
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setItems(json.items ?? []);
      setCount(json.count ?? 0);
    } catch {
      setItems([]);
      setCount(0);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAlerts();
    const t = setInterval(() => void loadAlerts(), 60_000);
    return () => clearInterval(t);
  }, [loadAlerts]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!panelRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <header className="sticky top-0 z-20 flex items-center justify-between gap-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/80 px-4 py-3 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="min-w-0">
        <p className="truncate text-xs text-[var(--color-muted)]">{companyName}</p>
        <h1
          className="truncate text-lg font-bold text-[var(--color-text)] sm:text-xl"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h1>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <div className="hidden sm:block">
          <PortalClock compact />
        </div>
        <Link
          href="/carrier/chat"
          className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          aria-label="Messages"
          title="Chat"
        >
          <Mail className="h-4 w-4" />
        </Link>
        <div className="relative" ref={panelRef}>
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              if (!open) void loadAlerts();
            }}
            className="relative rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
            aria-label="Alerts"
            aria-expanded={open}
          >
            <Bell className="h-4 w-4" />
            {count > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange-400" />
            ) : null}
          </button>
          {open ? (
            <div className="absolute right-0 z-40 mt-2 w-[min(100vw-2rem,20rem)] overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-xl">
              <div className="border-b border-[var(--color-border)] px-3 py-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  Alerts {count > 0 ? `(${count})` : ""}
                </p>
              </div>
              <ul className="max-h-72 overflow-y-auto">
                {loading && items.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-[var(--color-muted)]">Loading…</li>
                ) : null}
                {!loading && items.length === 0 ? (
                  <li className="px-3 py-4 text-sm text-[var(--color-muted)]">
                    No alerts right now.
                  </li>
                ) : null}
                {items.map((item) => (
                  <li key={item.id} className="border-b border-[var(--color-border)] last:border-0">
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block px-3 py-3 hover:bg-[var(--color-accent-dim)]/40"
                    >
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--color-accent)]">
                        {item.kind === "document" ? "Documents" : "Announcement"}
                      </p>
                      <p className="mt-0.5 text-sm font-medium text-[var(--color-text)]">
                        {item.title}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">
                        {item.body}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
        <div className="hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)] text-xs font-bold text-[var(--color-accent)] sm:flex">
          {companyName.slice(0, 1).toUpperCase()}
        </div>
      </div>
    </header>
  );
}
