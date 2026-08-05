import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DispatcherAgreementsPanel } from "@/components/freight/DispatcherAgreementsPanel";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageCarrierAgreements, dispatcherLandingPath } from "@/lib/tms/permissions";
import { isDispatcherRole } from "@/lib/tms/roles";

export const metadata: Metadata = {
  title: "Agreements — Dispatcher",
};

export const dynamic = "force-dynamic";

export default async function DispatcherAgreementsPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!user || !isDispatcherRole(role)) redirect("/login");
  if (!canManageCarrierAgreements(role)) redirect(dispatcherLandingPath(role));

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Agreements
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Send carrier dispatch service agreements and track e-sign status
        </p>
      </div>
      <DispatcherAgreementsPanel />
    </div>
  );
}
