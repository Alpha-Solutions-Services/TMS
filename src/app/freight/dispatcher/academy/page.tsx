import type { Metadata } from "next";
import { Suspense } from "react";
import { DispatcherAcademyPage } from "@/components/freight/DispatcherAcademyPage";

export const metadata: Metadata = {
  title: "Academy — Dispatcher",
};

export default function DispatcherAcademyRoute() {
  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <div className="p-4 sm:p-6 lg:p-8">
        <DispatcherAcademyPage />
      </div>
    </Suspense>
  );
}
