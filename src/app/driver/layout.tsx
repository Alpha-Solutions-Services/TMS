import { redirect } from "next/navigation";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { TmsSidebar } from "@/components/tms/TmsSidebar";
import { getPortalUser, portalDisplayName } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";

export const dynamic = "force-dynamic";

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPortalUser();
  if (!user) redirect("/login");

  const role = await resolveTmsRole(user);
  if (role !== "driver") redirect("/");

  return (
    <ResponsiveDashboardShell
      mobileTitle="Driver Portal"
      sidebar={
        <TmsSidebar
          email={user.email}
          displayName={portalDisplayName(user)}
          role={role}
          portal="driver"
        />
      }
    >
      {children}
    </ResponsiveDashboardShell>
  );
}
