import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DispatcherSidebar } from "@/components/freight/DispatcherSidebar";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { createClient } from "@/lib/supabase/server";
import { canAccessDispatcherPortal, resolveTmsRole } from "@/lib/tms/auth";

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
  const isSuper = tmsRole === "super_dispatcher";
  const email = user.email ?? "Dispatcher";

  return (
    <ResponsiveDashboardShell
      mobileTitle="Dispatcher"
      sidebar={<DispatcherSidebar email={email} isSuper={isSuper} roleLabel={isSuper ? "Super Dispatcher" : "Sub Dispatcher"} />}
    >
      <main className="min-h-[calc(100vh-5rem)] bg-[var(--color-bg)]">{children}</main>
    </ResponsiveDashboardShell>
  );
}
