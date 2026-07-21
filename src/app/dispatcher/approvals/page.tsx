import { redirect } from "next/navigation";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { ApprovalsPageClient } from "@/components/tms/ApprovalsPageClient";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") redirect("/dispatcher");
  return <ApprovalsPageClient />;
}
