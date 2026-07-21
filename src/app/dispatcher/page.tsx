import { resolveTmsRole } from "@/lib/tms/auth";
import { getPortalUser } from "@/lib/portal/auth";
import { DispatcherDashboardClient } from "@/components/tms/DispatcherDashboardClient";

export const dynamic = "force-dynamic";

export default async function DispatcherPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  const isSuper = role === "super_dispatcher";
  return <DispatcherDashboardClient isSuper={isSuper} />;
}
