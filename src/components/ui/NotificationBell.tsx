"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import clsx from "clsx";
import Link from "next/link";

type Notif = {
  id: string;
  title: string;
  body?: string | null;
  href?: string | null;
  read_at?: string | null;
  created_at: string;
};

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Notif[]>([]);
  const [unread, setUnread] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications");
      const j = (await res.json()) as {
        notifications?: Notif[];
        unread?: number;
      };
      setItems(j.notifications ?? []);
      setUnread(j.unread ?? 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void load();
    const t = window.setInterval(() => void load(), 45000);
    return () => window.clearInterval(t);
  }, [load]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  async function markAll() {
    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ all: true }),
    });
    void load();
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void load();
        }}
        className="relative rounded-xl border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:bg-[var(--color-accent-dim)] hover:text-[var(--color-accent)]"
        aria-label="Notifications"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-accent)] px-1 text-[10px] font-bold text-[#05080f]">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--glow-md)]">
          <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-3">
            <p className="text-sm font-semibold text-[var(--color-text)]">
              Notifications
            </p>
            {unread > 0 ? (
              <button
                type="button"
                onClick={() => void markAll()}
                className="text-xs text-[var(--color-accent)] hover:underline"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          <ul className="max-h-80 overflow-y-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-[var(--color-muted)]">
                You’re all caught up.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <Link
                    href={n.href || "#"}
                    onClick={() => {
                      void fetch("/api/notifications", {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ ids: [n.id] }),
                      });
                      setOpen(false);
                    }}
                    className={clsx(
                      "block border-b border-[var(--color-border)]/50 px-4 py-3 hover:bg-[var(--color-bg)]/60",
                      !n.read_at && "bg-[var(--color-accent-dim)]/20"
                    )}
                  >
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {n.title}
                    </p>
                    {n.body ? (
                      <p className="mt-0.5 line-clamp-2 text-xs text-[var(--color-muted)]">
                        {n.body}
                      </p>
                    ) : null}
                    <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                      {new Date(n.created_at).toLocaleString()}
                    </p>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
