import { redirect } from "next/navigation";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { TmsSidebar } from "@/components/tms/TmsSidebar";
import { getPortalUser, portalDisplayName } from "@/lib/portal/auth";
import { isDispatcherRole, resolveTmsRole } from "@/lib/tms/auth";

export const dynamic = "force-dynamic";

export default async function DispatcherLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPortalUser();
  if (!user) redirect("/login");

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) redirect("/");

  return (
    <ResponsiveDashboardShell
      mobileTitle="Dispatcher"
      sidebar={
        <TmsSidebar
          email={user.email}
          displayName={portalDisplayName(user)}
          role={role!}
          portal="dispatcher"
        />
      }
    >
      {children}
    </ResponsiveDashboardShell>
  );
}
