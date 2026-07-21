"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, MessageSquare, Truck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/driver/dashboard", label: "My loads", icon: Truck },
  { href: "/driver/chat", label: "Chat", icon: MessageSquare },
] as const;

export function DriverSidebar({ name, email }: { name: string; email: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/50">
      <div className="border-b border-[var(--color-border)] px-4 py-4">
        <p className="text-xs uppercase text-[var(--color-accent)]">Driver cockpit</p>
        <p className="truncate text-sm font-semibold text-[var(--color-text)]">{name}</p>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm",
                active
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                  : "text-[var(--color-muted)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon className="h-4 w-4" />
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
