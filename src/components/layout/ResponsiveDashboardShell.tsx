"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Suspense } from "react";
import clsx from "clsx";
import {
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Package,
  Sparkles,
  Ticket,
  Truck,
  Users,
  UsersRound,
} from "lucide-react";
import {
  MobileBottomNav,
  type MobileNavItem,
} from "@/components/layout/MobileBottomNav";

const CloseMobileNavContext = createContext<(() => void) | undefined>(
  undefined,
);

export function useDashboardMobileNavClose(): (() => void) | undefined {
  return useContext(CloseMobileNavContext);
}

export type DashboardShellVariant =
  | "dispatcher"
  | "carrier"
  | "driver"
  | "instructor"
  | "client"
  | "admin";

const BOTTOM_NAV: Record<DashboardShellVariant, MobileNavItem[]> = {
  dispatcher: [
    {
      href: "/dispatcher/dashboard",
      label: "Home",
      icon: LayoutDashboard,
      match: ["/dispatcher/dashboard"],
    },
    {
      href: "/dispatcher/loads",
      label: "Loads",
      icon: Package,
      match: ["/dispatcher/loads"],
    },
    {
      href: "/dispatcher/chat",
      label: "Chat",
      icon: MessageSquare,
      match: ["/dispatcher/chat"],
    },
    {
      href: "/dispatcher/team",
      label: "Team",
      icon: UsersRound,
      match: ["/dispatcher/team"],
    },
  ],
  carrier: [
    {
      href: "/carrier/dashboard",
      label: "Home",
      icon: LayoutDashboard,
      match: ["/carrier/dashboard"],
    },
    {
      href: "/carrier/loads",
      label: "Loads",
      icon: Package,
      match: ["/carrier/loads"],
    },
    {
      href: "/carrier/chat",
      label: "Chat",
      icon: MessageSquare,
      match: ["/carrier/chat"],
    },
    {
      href: "/carrier/payments",
      label: "Pay",
      icon: CreditCard,
      match: ["/carrier/payments"],
    },
  ],
  driver: [
    {
      href: "/driver/dashboard",
      label: "Loads",
      icon: Truck,
      match: ["/driver/dashboard"],
    },
    {
      href: "/driver/chat",
      label: "Chat",
      icon: MessageSquare,
      match: ["/driver/chat"],
    },
  ],
  instructor: [
    {
      href: "/freight/instructor/dashboard",
      label: "Home",
      icon: LayoutDashboard,
      match: ["/freight/instructor/dashboard"],
    },
    {
      href: "/freight/instructor/students",
      label: "Students",
      icon: Users,
      match: ["/freight/instructor/students"],
    },
    {
      href: "/freight/instructor/modules",
      label: "Learn",
      icon: Package,
      match: ["/freight/instructor/modules"],
    },
  ],
  client: [
    { href: "/dashboard", label: "Home", icon: LayoutDashboard, tab: "overview" },
    {
      href: "/dashboard?tab=messages",
      label: "Chat",
      icon: MessageSquare,
      tab: "messages",
    },
    { href: "/dashboard?tab=ai", label: "Assist", icon: Sparkles, tab: "ai" },
    {
      href: "/dashboard?tab=projects",
      label: "Projects",
      icon: FolderKanban,
      tab: "projects",
    },
  ],
  admin: [
    { href: "/admin", label: "Home", icon: LayoutDashboard, tab: "overview" },
    {
      href: "/admin?tab=clients",
      label: "Chat",
      icon: MessageSquare,
      tab: "clients",
    },
    { href: "/admin?tab=ai", label: "Assist", icon: Sparkles, tab: "ai" },
    {
      href: "/admin?tab=tickets",
      label: "Tickets",
      icon: Ticket,
      tab: "tickets",
    },
  ],
};

export function ResponsiveDashboardShell({
  sidebar,
  mobileTitle,
  children,
  headerRight,
  variant = "dispatcher",
  bottomNav,
}: {
  sidebar: ReactNode;
  mobileTitle: string;
  children: ReactNode;
  headerRight?: ReactNode;
  variant?: DashboardShellVariant;
  bottomNav?: MobileNavItem[];
}) {
  const [open, setOpen] = useState(false);
  const dock = bottomNav ?? BOTTOM_NAV[variant];

  function closeMobile() {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <div className="relative flex h-[100dvh] max-h-[100dvh] w-full overflow-hidden bg-[var(--color-bg)]">
      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 backdrop-blur-[2px] md:hidden"
          aria-label="Close menu"
          onClick={closeMobile}
        />
      ) : null}

      <div
        id="dashboard-sidebar"
        className={clsx(
          "fixed left-0 top-0 z-50 flex h-screen max-w-[85vw] transition-transform duration-200 ease-out md:static md:z-0 md:h-full md:max-w-none md:translate-x-0 md:transition-none",
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0",
        )}
      >
        <CloseMobileNavContext.Provider value={closeMobile}>
          {sidebar}
        </CloseMobileNavContext.Provider>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <header className="sticky top-0 z-30 flex shrink-0 items-center gap-3 border-b border-[var(--color-border)] bg-[var(--color-bg)]/95 px-4 py-3 backdrop-blur-md">
          <button
            type="button"
            className="rounded-lg border border-[var(--color-border)] p-2 text-[var(--color-text)] hover:bg-[var(--color-surface)] md:hidden"
            aria-expanded={open}
            aria-controls="dashboard-sidebar"
            aria-label="Open full menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5 shrink-0" aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)] md:pl-2">
            {mobileTitle}
          </span>
          {headerRight}
        </header>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] md:pb-0">
          {children}
        </div>
      </div>

      {dock.length > 0 ? (
        <Suspense fallback={null}>
          <MobileBottomNav items={dock} />
        </Suspense>
      ) : null}
    </div>
  );
}
