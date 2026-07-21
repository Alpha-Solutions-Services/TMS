import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DispatcherDriversManage } from "@/components/freight/DispatcherDriversManage";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canInviteCarriersAndDrivers } from "@/lib/tms/permissions";
import { isDispatcherRole } from "@/lib/tms/roles";

export const metadata: Metadata = {
  title: "Drivers — Dispatcher",
};

export const dynamic = "force-dynamic";

export default async function DispatcherDriversPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!user || !isDispatcherRole(role)) {
    redirect("/login");
  }

  const canInvite = canInviteCarriersAndDrivers(role);

  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <div className="p-4 sm:p-6 lg:p-8">
        <DispatcherDriversManage canInvite={canInvite} />
      </div>
    </Suspense>
  );
}
