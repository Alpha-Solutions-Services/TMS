import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { FreightLoginForm } from "@/components/freight/FreightLoginForm";
import { createClient } from "@/lib/supabase/server";
import { resolveLoginDestination } from "@/lib/tms/resolve-destination";

export const metadata: Metadata = {
  title: "Login — Alpha Freight Network TMS",
  description: "Sign in to TMS — dispatcher, carrier, or driver portal.",
};

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const sb = await createClient();
  if (sb) {
    const {
      data: { user },
    } = await sb.auth.getUser();
    if (user?.id) {
      const dest = await resolveLoginDestination(user);
      if (dest.path && dest.path !== "/login") {
        redirect(dest.path);
      }
    }
  }

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
