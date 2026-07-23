import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { DriverSidebar } from "@/components/freight/DriverSidebar";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function DriverLayout({ children }: Readonly<{ children: ReactNode }>) {
  const sb = await createClient();
  if (!sb) redirect("/login");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) redirect("/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("role, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "driver") {
    redirect("/login");
  }

  return (
    <ResponsiveDashboardShell
      mobileTitle="Driver"
      sidebar={
        <DriverSidebar
          name={(profile.full_name as string) || "Driver"}
          email={user.email ?? ""}
        />
      }
    >
      <main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[var(--color-bg)]">
        {children}
      </main>
    </ResponsiveDashboardShell>
  );
}
