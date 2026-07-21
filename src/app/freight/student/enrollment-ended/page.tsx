import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Enrollment ended — Alpha Freight Academy",
  description: "Your subscription or refund policy window has concluded.",
};

export default function EnrollmentEndedPage() {
  return (
    <main className="min-h-[60vh] bg-[var(--color-bg)] px-4 pb-24 pt-20">
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-10 text-center sm:px-10 sm:py-12">
        <h1 className="text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display), sans-serif" }}>
          Enrollment update
        </h1>
        <p className="mt-4 text-[var(--color-muted)]">
          Your academy access paused after a billing change or refund. Re-enroll whenever you&apos;re ready
          — your progress stays archived for support review.
        </p>
        <Link
          href="/freight/student/enroll"
          className="mt-10 inline-flex items-center justify-center rounded-lg bg-[var(--color-accent)] px-8 py-3 text-sm font-semibold text-[#05080f]"
        >
          Review plans &amp; enroll
        </Link>
      </div>
    </main>
  );
}
