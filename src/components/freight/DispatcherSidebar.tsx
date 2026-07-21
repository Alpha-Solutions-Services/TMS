"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  AlertTriangle,
  BarChart3,
  FileText,
  LayoutDashboard,
  Package,
  ShieldCheck,
  UserPlus,
  Users,
  UsersRound,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";
import { PortalClock } from "@/components/freight/PortalClock";

const NAV = [
  { href: "/dispatcher/dashboard", label: "Dashboard", icon: LayoutDashboard, superOnly: false },
  { href: "/dispatcher/loads", label: "Loads", icon: Package, superOnly: false },
  { href: "/dispatcher/carriers", label: "Carriers", icon: Users, superOnly: false },
  { href: "/dispatcher/carrier-portal", label: "Carrier portal", icon: Users, superOnly: false },
  { href: "/dispatcher/invoices", label: "Invoices", icon: FileText, superOnly: false },
  { href: "/dispatcher/reports", label: "Reports", icon: BarChart3, superOnly: false },
  { href: "/dispatcher/alerts", label: "Alerts", icon: AlertTriangle, superOnly: false },
  { href: "/dispatcher/drivers", label: "Drivers", icon: UserPlus, superOnly: false },
  { href: "/dispatcher/approvals", label: "Approvals", icon: ShieldCheck, superOnly: true },
  { href: "/dispatcher/team", label: "Team", icon: UsersRound, superOnly: true },
] as const;

export function DispatcherSidebar({
  email,
  isSuper,
  roleLabel,
}: {
  email: string;
  isSuper: boolean;
  roleLabel: string;
}) {
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
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">
              Alpha Freight
            </p>
            <p className="truncate text-xs text-[var(--color-muted)]">{roleLabel}</p>
          </div>
        </div>
        <div className="mt-4">
          <PortalClock compact />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {NAV.filter((item) => isSuper || !item.superOnly).map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/dispatcher/dashboard" && pathname.startsWith(href));
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
