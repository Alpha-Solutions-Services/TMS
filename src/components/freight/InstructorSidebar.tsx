"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";
import { PortalClock } from "@/components/freight/PortalClock";

const NAV = [
  { href: "/freight/instructor/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/freight/instructor/students", label: "Students", icon: Users },
  { href: "/freight/instructor/modules", label: "Modules", icon: BookOpen },
] as const;

export function InstructorSidebar({ email }: { email: string }) {
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
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-accent)]/40 bg-[var(--color-accent-dim)] text-[var(--color-accent)]">
            <GraduationCap className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">
              Alpha Academy
            </p>
            <p className="truncate text-xs text-[var(--color-muted)]">Instructor</p>
          </div>
        </div>
        <div className="mt-4">
          <PortalClock compact />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/freight/instructor/dashboard" && pathname.startsWith(href));
          return (
            <Link
              key={href}
              href={href}
              onClick={() => closeMobile?.()}
              className={clsx(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition",
                active
                  ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)] shadow-[var(--glow-sm)]"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" aria-hidden />
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
          className="mt-3 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
