import { redirect } from "next/navigation";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { PortalSidebar } from "@/components/portal/PortalSidebar";
import { isPortalStaff } from "@/lib/admin-auth";
import { getPortalUser, portalDisplayName } from "@/lib/portal/auth";
import { NotificationBell } from "@/components/ui/NotificationBell";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPortalUser();
  if (!user) redirect("/login");
  if (await isPortalStaff(user)) redirect("/admin");

  return (
    <ResponsiveDashboardShell
      mobileTitle="Client portal"
      sidebar={
        <PortalSidebar
          displayName={portalDisplayName(user)}
          email={user.email}
        />
      }
      headerRight={<NotificationBell />}
    >
      {children}
    </ResponsiveDashboardShell>
  );
}
