import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DispatcherSidebar } from "@/components/freight/DispatcherSidebar";
import { DispatcherRouteGuard } from "@/components/freight/DispatcherRouteGuard";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { createClient } from "@/lib/supabase/server";
import { canAccessDispatcherPortal, ensureDispatcherTmsUser, resolveTmsRole } from "@/lib/tms/auth";
import { displayRoleLabel } from "@/lib/tms/permissions";
import { isDispatcherRole } from "@/lib/tms/roles";

export const dynamic = "force-dynamic";

export default async function DispatcherLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const sb = await createClient();
  if (!sb) redirect("/login");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) redirect("/login");

  if (!(await canAccessDispatcherPortal(user))) {
    redirect("/login?error=terminated");
  }

  const tmsRole = await resolveTmsRole(user);
  const email = user.email ?? "Dispatcher";
  const roleLabel = displayRoleLabel(tmsRole, email);

  if (tmsRole === "super_dispatcher" && user.email) {
    void ensureDispatcherTmsUser({
      userId: user.id,
      email: user.email,
      superDispatcher: true,
    });
  }

  if (!isDispatcherRole(tmsRole)) {
    redirect("/login");
  }

  return (
    <ResponsiveDashboardShell
      mobileTitle="Dispatcher"
      sidebar={<DispatcherSidebar email={email} tmsRole={tmsRole} roleLabel={roleLabel} />}
    >
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg)]">
        <DispatcherRouteGuard tmsRole={tmsRole}>{children}</DispatcherRouteGuard>
      </main>
    </ResponsiveDashboardShell>
  );
}
