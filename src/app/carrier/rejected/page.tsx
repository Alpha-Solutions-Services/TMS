import type { Metadata } from "next";
import Link from "next/link";
import { FreightSignOutLink } from "@/components/freight/FreightSignOutLink";

export const metadata: Metadata = {
  title: "Application not approved — Alpha Freight",
  description:
    "Your carrier registration was declined. Contact freight support if you believe this was a mistake.",
};

export default function CarrierRejectedPage() {
  return (
    <main className="min-h-[65vh] bg-[var(--color-bg)] px-4 pb-24 pt-20">
      <div className="mx-auto max-w-lg rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-10 text-center sm:px-10 sm:py-12">
        <h1 className="text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
          Application not approved
        </h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Dispatch left context in your onboarding email thread. Respond there or escalate through{" "}
          <a className="text-[var(--color-accent)]" href="mailto:support@freight.alphasolutions.software">
            support@freight.alphasolutions.software
          </a>
          .
        </p>
        <FreightSignOutLink />
        <Link href="/login" className="mt-4 block text-xs text-[var(--color-muted)] underline">
          Return to login chooser
        </Link>
      </div>
    </main>
  );
}
