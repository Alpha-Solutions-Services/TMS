"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, MessageSquare, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";

const NAV = [
  { href: "/driver/dashboard", label: "My loads", icon: Truck },
  { href: "/driver/chat", label: "Chat", icon: MessageSquare },
] as const;

export function DriverSidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const closeMobile = useDashboardMobileNavClose();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/50 backdrop-blur-sm">
      <div className="border-b border-[var(--color-border)] px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)] text-sm font-bold text-[var(--color-accent)]">
            <LayoutDashboard className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-[var(--color-accent)]">
              Driver cockpit
            </p>
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</p>
          </div>
        </div>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              onClick={() => closeMobile?.()}
              className={clsx(
                "flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm",
                active
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-[var(--color-border)] p-4">
        <p className="truncate text-xs text-[var(--color-muted)]">{email}</p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-2 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
