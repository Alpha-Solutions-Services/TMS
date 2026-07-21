import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { InstructorSidebar } from "@/components/freight/InstructorSidebar";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function InstructorLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  const sb = await createClient();
  if (!sb) redirect("/login");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) redirect("/login");

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role !== "instructor" && profile?.role !== "dispatcher") {
    redirect("/login?error=unauthorized_instructor");
  }

  return (
    <ResponsiveDashboardShell
      mobileTitle="Instructor"
      sidebar={<InstructorSidebar email={user.email ?? "Instructor"} />}
    >
      <main className="min-h-[calc(100vh-5rem)] bg-[var(--color-bg)]">{children}</main>
    </ResponsiveDashboardShell>
  );
}
