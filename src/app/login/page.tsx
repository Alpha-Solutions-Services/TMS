import type { Metadata } from "next";
import { Suspense } from "react";
import { FreightLoginForm } from "@/components/freight/FreightLoginForm";

export const metadata: Metadata = {
  title: "Login — Alpha Freight Network TMS",
  description: "Sign in to TMS — dispatcher, carrier, or driver portal.",
};

export default function LoginPage() {
  return (
    <main className="min-h-[100dvh] bg-[var(--color-bg)]">
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
