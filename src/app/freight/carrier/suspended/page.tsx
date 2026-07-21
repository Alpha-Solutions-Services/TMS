import type { Metadata } from "next";
import { FreightSignOutLink } from "@/components/freight/FreightSignOutLink";

export const metadata: Metadata = {
  title: "Carrier account suspended — Alpha Freight",
};

export default function CarrierSuspendedPage() {
  return (
    <main className="min-h-[60vh] bg-[var(--color-bg)] px-4 pb-24 pt-24 text-center">
      <div className="mx-auto max-w-md rounded-2xl border border-amber-500/35 bg-[#1a1405]/70 px-8 py-12">
        <h1 className="text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
          Suspended access
        </h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Dispatch temporarily locked this tenant for compliance remediation. Respond to latest notice email before requesting reinstatement.
        </p>
        <FreightSignOutLink />
      </div>
    </main>
  );
}
