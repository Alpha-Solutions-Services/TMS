import { Suspense } from "react";
import { AdminDashboardClient } from "@/components/admin/AdminDashboardClient";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-sm text-[var(--color-muted)]">Loading…</div>
      }
    >
      <AdminDashboardClient />
    </Suspense>
  );
}
