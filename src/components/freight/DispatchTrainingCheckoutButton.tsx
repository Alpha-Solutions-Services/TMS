"use client";

import Link from "next/link";

const LEARN_DISPATCH_ENROLL = "https://learndispatch.alphasolutions.software/enroll";

export function DispatchTrainingCheckoutButton() {
  return (
    <div className="mt-8">
      <Link
        href={LEARN_DISPATCH_ENROLL}
        className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] px-8 py-4 text-sm font-semibold text-[#05080F] transition-opacity hover:opacity-90 sm:w-auto"
      >
        Enroll online — PKR 34,000 bundle
      </Link>
      <p className="mt-3 text-xs text-[var(--color-muted)]">
        Pay via NayaPay to 0321 644 3914 · PKR 20,000/month also available
      </p>
    </div>
  );
}
