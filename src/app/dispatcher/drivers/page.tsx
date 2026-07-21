import type { Metadata } from "next";
import { Suspense } from "react";
import { DispatcherDriversManage } from "@/components/freight/DispatcherDriversManage";

export const metadata: Metadata = {
  title: "Drivers — Dispatcher",
};

export default function DispatcherDriversPage() {
  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <div className="p-4 sm:p-6 lg:p-8">
        <DispatcherDriversManage />
      </div>
    </Suspense>
  );
}
