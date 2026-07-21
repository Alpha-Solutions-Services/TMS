import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Alpha Freight Academy",
  description:
    "Freight dispatch certification — syllabus, pacing, outcomes, and enrollment via Zelle, Payoneer, or Wise.",
};

const courseLd = {
  "@context": "https://schema.org",
  "@type": "Course",
  name: "Freight Dispatching Certification",
  description:
    "Learn professional freight dispatching from load boards to carrier relationships.",
  provider: {
    "@type": "Organization",
    name: "Alpha Solutions",
    sameAs: "https://alphasolutions.software",
  },
  offers: {
    "@type": "Offer",
    price: "120",
    priceCurrency: "USD",
  },
};

export default function FreightStudentLandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)] px-4 pb-20 pt-16 sm:px-6 lg:px-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(courseLd),
        }}
      />
      <div className="mx-auto max-w-3xl text-center">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-accent)]">
          Alpha Freight Academy
        </p>
        <h1
          className="mt-4 text-4xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          Dispatch training that mirrors the live desk
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-[var(--color-muted)]">
          Ten guided modules spanning load-board discipline, negotiation, carrier comms,
          compliance checkpoints, paperwork cadence, and scenario drills you can replay.
        </p>
        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/freight/student/enroll"
            className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-[var(--color-accent)] px-8 py-3 text-sm font-bold text-[#05080f]"
          >
            Enroll &amp; unlock studio
          </Link>
          <Link
            href="/freight/login"
            className="inline-flex min-w-[220px] items-center justify-center rounded-lg border border-[var(--color-border)] px-8 py-3 text-sm font-semibold text-[var(--color-text)]"
          >
            Student login
          </Link>
        </div>
      </div>
    </main>
  );
}
