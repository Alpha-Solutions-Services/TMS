"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BarChart3,
  BookOpen,
  Calendar,
  FileSignature,
  FolderKanban,
  GitBranch,
  Inbox,
  LayoutDashboard,
  MessageSquare,
  Sparkles,
  Ticket,
  Users,
} from "lucide-react";
import { LogoutButton } from "@/components/portal/LogoutButton";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";

export function AdminSidebar({ email }: { email?: string | null }) {
  const close = useDashboardMobileNavClose();

  const links = [
    { href: "/admin", label: "Overview", icon: LayoutDashboard },
    { href: "/admin?tab=pipeline", label: "Pipeline", icon: GitBranch },
    { href: "/admin?tab=quotes", label: "Quotes & contracts", icon: FileSignature },
    { href: "/admin?tab=schedule", label: "Schedule", icon: Calendar },
    { href: "/admin?tab=projects", label: "Projects", icon: FolderKanban },
    { href: "/admin?tab=tickets", label: "Tickets", icon: Ticket },
    { href: "/admin?tab=ai", label: "Assistant", icon: Sparkles },
    { href: "/admin?tab=knowledge", label: "Knowledge", icon: BookOpen },
    { href: "/admin?tab=reports", label: "Reports", icon: BarChart3 },
    { href: "/admin?tab=staff", label: "Staff", icon: Users },
    { href: "/admin?tab=inquiries", label: "Inquiries", icon: Inbox },
    { href: "/admin?tab=clients", label: "Chat", icon: MessageSquare },
  ];

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/80 p-4">
      <Link
        href="/admin"
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
          <p className="text-[11px] text-[var(--color-muted)]">Admin CRM</p>
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
        {email ? (
          <p className="truncate text-xs text-[var(--color-muted)]">{email}</p>
        ) : null}
        <LogoutButton redirectTo="/login?role=admin" />
      </div>
    </aside>
  );
}
