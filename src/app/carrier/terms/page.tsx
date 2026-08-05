import type { Metadata } from "next";
import Link from "next/link";
import { buildCarrierTermsOfServiceSections } from "@/lib/freight/carrier-agreement-terms";

export const metadata: Metadata = {
  title: "Terms of Service — Alpha Freight Network",
  description:
    "Alpha Freight Network Terms of Service — payment, collection, liability, and compliance.",
};

/** Standalone Terms of Service (linked from the carrier agreement e-sign page). */
export default function CarrierTermsOfServicePage() {
  const tos = buildCarrierTermsOfServiceSections();

  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <Link
          href="/carrier/register"
          className="text-xs font-semibold text-[var(--color-accent)]"
        >
          ← Carrier registration
        </Link>
        <h1
          className="mt-6 text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Alpha Freight Network — Terms of Service
        </h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Enforcement, collection, liability, and legal remedy provisions. These
          Terms form part of your acceptance of the Carrier Dispatch Services
          Agreement.
        </p>

        <div className="mt-8 space-y-5 rounded-2xl border border-[var(--color-border)] bg-[#0a1018] p-5 sm:p-8">
          {tos.map((s) => (
            <section key={s.id}>
              <h2 className="text-sm font-semibold text-[var(--color-accent)]">
                {s.title}
              </h2>
              <div
                className="mt-2 text-sm leading-relaxed text-[var(--color-text)] [&_p]:mt-2"
                dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
              />
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
