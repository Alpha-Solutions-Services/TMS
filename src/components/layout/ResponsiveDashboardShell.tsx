"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import clsx from "clsx";
import { Menu } from "lucide-react";

const CloseMobileNavContext = createContext<(() => void) | undefined>(
  undefined
);

export function useDashboardMobileNavClose(): (() => void) | undefined {
  return useContext(CloseMobileNavContext);
}

export function ResponsiveDashboardShell({
  sidebar,
  mobileTitle,
  children,
  headerRight,
}: {
  sidebar: ReactNode;
  mobileTitle: string;
  children: ReactNode;
  headerRight?: ReactNode;
}) {
  const [open, setOpen] = useState(false);

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
          open ? "translate-x-0 shadow-2xl" : "-translate-x-full md:translate-x-0"
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
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5 shrink-0" aria-hidden />
          </button>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[var(--color-text)] md:pl-2">
            {mobileTitle}
          </span>
          {headerRight}
        </header>
        {children}
      </div>
    </div>
  );
}
