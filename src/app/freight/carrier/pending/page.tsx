import type { Metadata } from "next";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { FreightSignOutLink } from "@/components/freight/FreightSignOutLink";

export const metadata: Metadata = {
  title: "Carrier approval pending — Alpha Freight",
  description:
    "Your MC verification succeeded — dispatch validates authority documents before unlocking loads.",
};

export default async function CarrierPendingPage() {
  const sb = await createClient();
  let emailDisp = "";

  const u = sb ? await sb.auth.getUser() : { data: { user: null } };
  emailDisp =
    typeof u?.data?.user?.email === "string" ? u.data.user!.email ?? "" : "";

  return (
    <main className="min-h-[70vh] bg-[var(--color-bg)] px-4 pb-24 pt-20">
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-10 text-center sm:px-10 sm:py-12">
        <Clock className="mx-auto h-14 w-14 text-[var(--color-accent)]" />
        <h1 className="mt-8 text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
          Your account is pending approval
        </h1>
        <p className="mt-4 text-[var(--color-muted)]">
          Our Alpha Freight desk reviews filings and insurance alignment before releasing dispatch consoles.
          Most reviews land within one business day.
        </p>
        {emailDisp ? (
          <p className="mt-6 rounded-lg bg-[var(--color-bg)]/60 px-4 py-3 text-xs text-[var(--color-muted)]">
            Watch <strong className="text-[var(--color-text)]">{emailDisp}</strong> for onboarding steps.
          </p>
        ) : null}
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Questions?{" "}
          <a href="mailto:freight@alphasolutions.software" className="font-semibold text-[var(--color-accent)]">
            freight@alphasolutions.software
          </a>
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <FreightSignOutLink />
        </div>
      </div>
    </main>
  );
}
