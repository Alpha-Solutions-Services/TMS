import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DispatcherCarrierReview } from "@/components/freight/DispatcherCarrierReview";
import { DispatcherCarrierManage } from "@/components/freight/DispatcherCarrierManage";
import { DispatcherCarrierRoster } from "@/components/freight/DispatcherCarrierRoster";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canInviteCarriersAndDrivers } from "@/lib/tms/permissions";
import { isDispatcherRole } from "@/lib/tms/roles";

export const metadata: Metadata = {
  title: "Carriers — Dispatcher",
};

export const dynamic = "force-dynamic";

function CarriersContent({
  showAdd,
  canManage,
}: {
  showAdd: boolean;
  canManage: boolean;
}) {
  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Carriers
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Google Sheet roster, onboarding queue, and dispatcher add/remove
        </p>
      </div>

      <DispatcherCarrierRoster showAdd={showAdd && canManage} canManage={canManage} />

      <DispatcherCarrierManage />

      <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:p-8">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Portal onboarding queue
        </h2>
        <div className="mt-6">
          <DispatcherCarrierReview />
        </div>
      </section>
    </div>
  );
}

export default async function DispatcherCarriersPage({
  searchParams,
}: {
  searchParams: { action?: string };
}) {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!user || !isDispatcherRole(role)) {
    redirect("/login");
  }

  const canManage = canInviteCarriersAndDrivers(role);

  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <CarriersContent
        showAdd={searchParams.action === "add"}
        canManage={canManage}
      />
    </Suspense>
  );
}
