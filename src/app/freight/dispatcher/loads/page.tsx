import type { Metadata } from "next";
import { Suspense } from "react";
import { DispatcherLoadsPage } from "@/components/freight/DispatcherLoadsPage";

export const metadata: Metadata = {
  title: "Loads — Dispatcher",
};

export default function LoadsPage() {
  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <DispatcherLoadsPage />
    </Suspense>
  );
}
