import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { DispatcherInvoicesPage } from "@/components/freight/DispatcherInvoicesPage";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canSendInvoices, dispatcherLandingPath } from "@/lib/tms/permissions";

export const metadata: Metadata = {
  title: "Invoices — Dispatcher",
};

export default async function InvoicesPage() {
  const user = await getPortalUser();
  const role = await resolveTmsRole(user);
  if (!canSendInvoices(role)) redirect(dispatcherLandingPath(role));

  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <DispatcherInvoicesPage />
    </Suspense>
  );
}
