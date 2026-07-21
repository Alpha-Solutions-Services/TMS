import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DispatcherReportsPage } from "@/components/freight/DispatcherReportsPage";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canViewReports, dispatcherLandingPath } from "@/lib/tms/permissions";

export const metadata: Metadata = {
  title: "Reports — Dispatcher",
};

export default async function ReportsPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!canViewReports(role)) redirect(dispatcherLandingPath(role));

  return <DispatcherReportsPage />;
}
