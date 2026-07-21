import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DispatcherDashboardClient } from "@/components/freight/DispatcherDashboardClient";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { dispatcherLandingPath } from "@/lib/tms/permissions";

export const metadata: Metadata = {
  title: "Dispatcher Dashboard — Alpha Freight",
  description:
    "Live dispatch metrics, load board, revenue, and fleet overview synced from your Google Dispatch Sheet.",
};

export default async function DispatcherDashboardPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (role === "sub_dispatcher") redirect(dispatcherLandingPath(role));

  return <DispatcherDashboardClient />;
}
