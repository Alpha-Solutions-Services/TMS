"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { TmsRole } from "@/lib/tms/roles";
import { canAccessDispatcherNavItem, dispatcherLandingPath } from "@/lib/tms/permissions";

export function DispatcherRouteGuard({
  tmsRole,
  children,
}: {
  tmsRole: TmsRole;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!tmsRole || !pathname) return;
    if (!canAccessDispatcherNavItem(tmsRole, pathname)) {
      router.replace(dispatcherLandingPath(tmsRole));
    }
  }, [pathname, router, tmsRole]);

  return children;
}
