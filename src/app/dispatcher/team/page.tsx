import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { dispatcherLandingPath } from "@/lib/tms/permissions";
import { TeamManagementClient } from "@/components/tms/TeamManagementClient";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") redirect(dispatcherLandingPath(role));
  return <TeamManagementClient />;
}
