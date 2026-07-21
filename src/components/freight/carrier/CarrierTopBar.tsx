"use client";

import { Bell, Mail, Menu } from "lucide-react";
import { PortalClock } from "@/components/freight/PortalClock";

export function CarrierTopBar({ title, companyName }: { title: string; companyName: string }) {
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
        <button
          type="button"
          className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          aria-label="Messages"
        >
          <Mail className="h-4 w-4" />
        </button>
        <button
          type="button"
          className="relative rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          aria-label="Notifications"
        >
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-orange-400" />
        </button>
        <div className="hidden h-9 w-9 items-center justify-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)] text-xs font-bold text-[var(--color-accent)] sm:flex">
          {companyName.slice(0, 1).toUpperCase()}
        </div>
        <button type="button" className="rounded-lg p-2 text-[var(--color-muted)] lg:hidden" aria-label="Menu">
          <Menu className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
