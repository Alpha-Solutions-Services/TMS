"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import clsx from "clsx";

export type MobileNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Path prefixes that count as active */
  match?: string[];
  /** Match ?tab= when deciding active state */
  tab?: string;
};

function isActive(
  pathname: string,
  searchTab: string | null,
  item: MobileNavItem,
) {
  if (item.tab) {
    const base = item.href.split("?")[0];
    const onBase = pathname === base || pathname === `${base}/`;
    if (!onBase) return false;
    if (item.tab === "overview") return !searchTab || searchTab === "overview";
    return searchTab === item.tab;
  }
  const prefixes = item.match ?? [item.href.split("?")[0]];
  return prefixes.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * Mobile-only bottom tab bar — same dock pattern as Learn Dispatch / Portal.
 */
export function MobileBottomNav({ items }: { items: MobileNavItem[] }) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const searchTab = searchParams.get("tab");
  const cols = Math.min(Math.max(items.length, 2), 5);

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-[var(--color-border)] bg-[#0a101c]/98 backdrop-blur-xl md:hidden"
      aria-label="Primary"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul
        className="mx-auto grid max-w-lg gap-0 px-1 pt-1 pb-1"
        style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
      >
        {items.map((item) => {
          const active = isActive(pathname, searchTab, item);
          return (
            <li key={`${item.href}-${item.label}`}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={clsx(
                  "flex flex-col items-center gap-1 rounded-xl px-1 py-2.5 transition",
                  active
                    ? "text-[var(--color-accent)]"
                    : "text-[var(--color-muted)] active:bg-white/5",
                )}
              >
                <item.icon
                  className="h-5 w-5"
                  strokeWidth={active ? 2.25 : 1.75}
                  aria-hidden
                />
                <span className="text-[10px] font-medium tracking-wide">
                  {item.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
