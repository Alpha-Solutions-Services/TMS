import type { Metadata } from "next";
import { Suspense } from "react";
import { DispatcherCarrierReview } from "@/components/freight/DispatcherCarrierReview";
import { DispatcherCarrierManage } from "@/components/freight/DispatcherCarrierManage";
import { DispatcherCarrierRoster } from "@/components/freight/DispatcherCarrierRoster";

export const metadata: Metadata = {
  title: "Carriers — Dispatcher",
};

function CarriersContent({ showAdd }: { showAdd: boolean }) {
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

      <DispatcherCarrierRoster showAdd={showAdd} />

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

export default function DispatcherCarriersPage({
  searchParams,
}: {
  searchParams: { action?: string };
}) {
  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <CarriersContent showAdd={searchParams.action === "add"} />
    </Suspense>
  );
}
