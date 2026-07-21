import type { Metadata } from "next";
import { Suspense } from "react";
import { FreightLoginForm } from "@/components/freight/FreightLoginForm";

export const metadata: Metadata = {
  title: "Login — Alpha Freight",
  description:
    "Sign in to your Alpha Freight dispatcher, carrier, driver, or student account.",
};

export default function FreightLoginPage() {
  return (
    <main className="min-h-[70vh] bg-[var(--color-bg)]">
      <Suspense
        fallback={
          <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--color-muted)]">
            Loading sign-in…
          </div>
        }
      >
        <FreightLoginForm />
      </Suspense>
    </main>
  );
}
