"use client";

import Link from "next/link";

export function DispatchTrainingCheckoutButton() {
  return (
    <div className="mt-8">
      <Link
        href="/freight/student/enroll"
        className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] px-8 py-4 text-sm font-semibold text-[#05080F] transition-opacity hover:opacity-90 sm:w-auto"
      >
        Enroll online — $120
      </Link>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Pay via Zelle, Payoneer, Wise, or WhatsApp after you submit enrollment.
      </p>
    </div>
  );
}
