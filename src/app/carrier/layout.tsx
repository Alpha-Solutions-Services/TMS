import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { CarrierSidebar } from "@/components/freight/CarrierSidebar";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function CarrierPortalLayout({
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
    .select("role, carrier_status, company_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "carrier") redirect("/login");
  if (profile.carrier_status === "pending") redirect("/carrier/pending");
  if (profile.carrier_status === "rejected") redirect("/carrier/rejected");
  if (profile.carrier_status === "suspended") redirect("/carrier/suspended");
  if (profile.carrier_status !== "verified") redirect("/carrier/pending");

  const email = user.email ?? "Carrier";

  return (
    <ResponsiveDashboardShell
      mobileTitle="Carrier"
      sidebar={
        <CarrierSidebar
          email={email}
          companyName={profile.company_name?.trim() || undefined}
        />
      }
    >
      <main className="min-h-[calc(100vh-5rem)] bg-[var(--color-bg)]">{children}</main>
    </ResponsiveDashboardShell>
  );
}
