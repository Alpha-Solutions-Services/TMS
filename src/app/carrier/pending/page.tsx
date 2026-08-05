import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Clock } from "lucide-react";
import { CarrierOnboardingDocsPanel } from "@/components/freight/CarrierOnboardingDocsPanel";
import { FreightSignOutLink } from "@/components/freight/FreightSignOutLink";
import { isCarrierIdentity } from "@/lib/freight/carrier-identity";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const metadata: Metadata = {
  title: "Carrier approval pending — Alpha Freight",
  description:
    "Your MC verification succeeded — dispatch validates authority documents before unlocking loads.",
};

export const dynamic = "force-dynamic";

export default async function CarrierPendingPage() {
  const sb = await createClient();
  if (!sb) redirect("/login");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) redirect("/login");

  const admin = getServiceRoleClient();
  const { data: profile } = admin
    ? await admin
        .from("profiles")
        .select("role, carrier_status, email")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  if (!profile || !isCarrierIdentity(profile)) redirect("/login");
  if (profile.carrier_status === "verified") redirect("/carrier/dashboard");
  if (profile.carrier_status === "rejected") redirect("/carrier/rejected");
  if (profile.carrier_status === "suspended") redirect("/carrier/suspended");
  if (profile.carrier_status !== "pending") redirect("/login");

  const emailDisp =
    (typeof profile.email === "string" && profile.email) ||
    (typeof user.email === "string" ? user.email : "") ||
    "";

  return (
    <main className="min-h-[70vh] bg-[var(--color-bg)] px-4 pb-24 pt-20">
      <div className="mx-auto max-w-lg rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-4 py-10 text-center sm:px-10 sm:py-12">
        <Clock className="mx-auto h-14 w-14 text-[var(--color-accent)]" />
        <h1
          className="mt-8 text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Your account is pending approval
        </h1>
        <p className="mt-4 text-[var(--color-muted)]">
          Our Alpha Freight desk reviews filings and insurance alignment before
          releasing dispatch consoles. Most reviews land within one business day.
        </p>
        <CarrierOnboardingDocsPanel />
        {emailDisp ? (
          <p className="mt-6 rounded-lg bg-[var(--color-bg)]/60 px-4 py-3 text-xs text-[var(--color-muted)]">
            Watch{" "}
            <strong className="text-[var(--color-text)]">{emailDisp}</strong> for
            onboarding steps.
          </p>
        ) : null}
        <p className="mt-4 text-xs text-[var(--color-muted)]">
          Questions?{" "}
          <a
            href="mailto:support@freight.alphasolutions.software"
            className="font-semibold text-[var(--color-accent)]"
          >
            support@freight.alphasolutions.software
          </a>
        </p>
        <div className="mt-10 flex flex-col items-center gap-3">
          <FreightSignOutLink />
        </div>
      </div>
    </main>
  );
}
