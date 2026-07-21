import { redirect } from "next/navigation";
import { ResponsiveDashboardShell } from "@/components/layout/ResponsiveDashboardShell";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { isPortalStaff } from "@/lib/admin-auth";
import { getPortalUser } from "@/lib/portal/auth";
import { NotificationBell } from "@/components/ui/NotificationBell";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getPortalUser();
  if (!user) redirect("/login?role=admin");
  if (!(await isPortalStaff(user))) redirect("/");

  return (
    <ResponsiveDashboardShell
      mobileTitle="Admin"
      sidebar={<AdminSidebar email={user.email} />}
      headerRight={<NotificationBell />}
    >
      {children}
    </ResponsiveDashboardShell>
  );
}
