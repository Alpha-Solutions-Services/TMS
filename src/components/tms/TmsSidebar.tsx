"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Truck, LogOut, ShieldCheck, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";

export function TmsSidebar({
  email,
  displayName,
  role,
  portal,
}: {
  email?: string | null;
  displayName: string;
  role: string;
  portal: "dispatcher" | "carrier" | "driver";
}) {
  const pathname = usePathname();
  const closeMobile = useDashboardMobileNavClose();

  const links =
    portal === "dispatcher"
      ? [
          { href: "/dispatcher", label: "Load Board", icon: LayoutDashboard },
          ...(role === "super_dispatcher"
            ? [
                { href: "/dispatcher/approvals", label: "Approvals", icon: ShieldCheck },
                { href: "/dispatcher/team", label: "Team", icon: Users },
              ]
            : []),
        ]
      : portal === "carrier"
        ? [{ href: "/carrier", label: "My Loads", icon: Truck }]
        : [{ href: "/driver", label: "My Loads", icon: Truck }];

  async function signOut() {
    const supabase = createClient();
    await supabase?.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <aside className="flex h-full w-64 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] p-5">
        <Image
          src="/afn-logo.png"
          alt="Alpha Freight Network"
          width={56}
          height={56}
          className="mx-auto rounded-full"
        />
        <p className="mt-3 text-center text-xs font-semibold uppercase tracking-wider text-[var(--color-chrome)]">
          Alpha Freight Network
        </p>
        <p className="mt-1 text-center text-[10px] text-[var(--color-muted)]">
          tms.alphasolutions.software
        </p>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {links.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            onClick={closeMobile}
            className={clsx(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors",
              pathname === href
                ? "bg-[var(--color-accent-dim)] text-[var(--color-accent-2)]"
                : "text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      <div className="border-t border-[var(--color-border)] p-4">
        <p className="truncate text-sm font-medium text-[var(--color-text)]">{displayName}</p>
        <p className="truncate text-xs text-[var(--color-muted)]">{email}</p>
        <p className="mt-1 text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
          {role.replace(/_/g, " ")}
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-3 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
        >
          <LogOut className="h-3.5 w-3.5" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
