import { Suspense } from "react";
import { PortalDashboardClient } from "@/components/portal/PortalDashboardClient";
import { getPortalUser } from "@/lib/portal/auth";
import { fetchPortalDashboardData } from "@/lib/sanity/portal-data";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await getPortalUser();
  if (!user) return null;
  const { projects, files } = await fetchPortalDashboardData(user.id);

  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[var(--color-muted)]">Loading…</div>
      }
    >
      <PortalDashboardClient projects={projects} files={files} />
    </Suspense>
  );
}
