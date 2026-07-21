import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DispatcherSidebar } from "@/components/freight/DispatcherSidebar";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { createClient } from "@/lib/supabase/server";

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

  const email = user.email ?? "Dispatcher";

  return (
    <ResponsiveDashboardShell
      mobileTitle="Dispatcher"
      sidebar={<DispatcherSidebar email={email} />}
    >
      <main className="min-h-[calc(100vh-5rem)] bg-[var(--color-bg)]">{children}</main>
    </ResponsiveDashboardShell>
  );
}
