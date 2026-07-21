"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import {
  CreditCard,
  FileText,
  LayoutDashboard,
  MessageSquare,
  Package,
  Settings,
  ShieldCheck,
  Truck,
  Upload,
  Users,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useDashboardMobileNavClose } from "@/components/layout/ResponsiveDashboardShell";
import { PortalClock } from "@/components/freight/PortalClock";

const NAV = [
  { href: "/freight/carrier/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/freight/carrier/loads", label: "Loads", icon: Package },
  { href: "/freight/carrier/trucks", label: "Trucks", icon: Truck },
  { href: "/freight/carrier/drivers", label: "Drivers", icon: Users },
  { href: "/freight/carrier/payments", label: "Payments", icon: CreditCard },
  { href: "/freight/carrier/invoices", label: "Invoices", icon: FileText },
  { href: "/freight/carrier/documents", label: "Documents", icon: Upload },
  { href: "/freight/carrier/compliance", label: "Compliance", icon: ShieldCheck },
  { href: "/freight/carrier/chat", label: "Dispatcher Chat", icon: MessageSquare },
  { href: "/freight/carrier/settings", label: "Settings", icon: Settings },
] as const;

export function CarrierSidebar({ email, companyName }: { email: string; companyName?: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const closeMobile = useDashboardMobileNavClose();

  async function signOut() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    router.push("/freight/login");
    router.refresh();
  }

  return (
    <aside className="flex h-full w-64 shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface)]/60 backdrop-blur-md">
      <div className="border-b border-[var(--color-border)] px-4 py-5">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--color-accent)]/50 bg-[var(--color-accent-dim)] text-sm font-bold text-[var(--color-accent)] shadow-[var(--glow-sm)]">
            A
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text)]">
              Alpha Freight
            </p>
            <p className="truncate text-xs text-[var(--color-muted)]">
              {companyName ?? "Carrier Portal"}
            </p>
          </div>
        </div>
        <div className="mt-4">
          <PortalClock compact />
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-0.5 overflow-y-auto p-3">
        {NAV.map(({ href, label, icon: Icon }) => {
          const active =
            pathname === href ||
            (href !== "/freight/carrier/dashboard" && pathname.startsWith(href));
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
