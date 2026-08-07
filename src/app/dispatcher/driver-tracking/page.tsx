import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DispatcherDriverTrackingPage } from "@/components/freight/DispatcherDriverTrackingPage";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

export const metadata: Metadata = {
  title: "Driver tracking — Dispatcher",
};

export const dynamic = "force-dynamic";

export default async function DriverTrackingRoute() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!user || !isDispatcherRole(role)) {
    redirect("/login");
  }

  return <DispatcherDriverTrackingPage />;
}
