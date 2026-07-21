"use client";

import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  FileSignature,
  FileText,
  FolderKanban,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Ticket,
} from "lucide-react";
import { LogoutButton } from "./LogoutButton";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";

export function PortalSidebar({
  displayName,
  email,
}: {
  displayName: string;
  email?: string | null;
}) {
  const close = useDashboardMobileNavClose();

  const links = [
    { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
    { href: "/dashboard?tab=projects", label: "Projects", icon: FolderKanban },
    { href: "/dashboard?tab=quotes", label: "Quotes", icon: FileText },
    { href: "/dashboard?tab=contracts", label: "Contracts", icon: FileSignature },
    { href: "/dashboard?tab=schedule", label: "Schedule", icon: Calendar },
    { href: "/dashboard?tab=tickets", label: "Tickets", icon: Ticket },
    { href: "/dashboard?tab=files", label: "Files", icon: FileText },
    { href: "/dashboard?tab=messages", label: "Messages", icon: MessageSquare },
    { href: "/dashboard?tab=ai", label: "Assistant", icon: Sparkles },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4">
      <Link
        href="/dashboard"
        onClick={() => close?.()}
        className="mb-6 flex items-center gap-3"
      >
        <Image
          src="/alpha-logo.png"
          alt="Alpha Solutions"
          width={40}
          height={40}
          className="rounded-lg"
        />
        <div>
          <p
            className="text-sm font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Alpha Portal
          </p>
          <p className="text-[11px] text-[var(--color-muted)]">Client</p>
        </div>
      </Link>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            onClick={() => close?.()}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-accent-dim)] hover:text-[var(--color-accent)]"
          >
            <l.icon className="h-4 w-4 shrink-0" />
            {l.label}
          </Link>
        ))}
      </nav>

      <div className="mt-auto space-y-3 border-t border-[var(--color-border)] pt-4">
        <div>
          <p className="truncate text-sm font-medium text-[var(--color-text)]">
            {displayName}
          </p>
          {email ? (
            <p className="truncate text-xs text-[var(--color-muted)]">{email}</p>
          ) : null}
        </div>
        <LogoutButton />
      </div>
    </aside>
  );
}
