import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CarrierOnboardingDocsPanel } from "@/components/freight/CarrierOnboardingDocsPanel";
import { FreightSignOutLink } from "@/components/freight/FreightSignOutLink";
import { isCarrierIdentity } from "@/lib/freight/carrier-identity";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const metadata: Metadata = {
  title: "Application not approved — Alpha Freight",
  description:
    "Your carrier registration was declined. Contact freight support if you believe this was a mistake.",
};

export const dynamic = "force-dynamic";

export default async function CarrierRejectedPage() {
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
        .select("role, carrier_status")
        .eq("id", user.id)
        .maybeSingle()
    : { data: null };

  if (!profile || !isCarrierIdentity(profile)) redirect("/login");
  if (profile.carrier_status === "verified") redirect("/carrier/dashboard");
  if (profile.carrier_status === "pending") redirect("/carrier/pending");
  if (profile.carrier_status === "suspended") redirect("/carrier/suspended");
  if (profile.carrier_status !== "rejected") redirect("/login");

  return (
    <main className="min-h-[65vh] bg-[var(--color-bg)] px-4 pb-24 pt-20">
      <div className="mx-auto max-w-lg rounded-2xl border border-red-500/35 bg-red-500/10 px-4 py-10 text-center sm:px-10 sm:py-12">
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Application not approved
        </h1>
        <p className="mt-4 text-sm text-[var(--color-muted)]">
          Dispatch left context in your onboarding email thread. Respond there or
          escalate through{" "}
          <a
            className="text-[var(--color-accent)]"
            href="mailto:support@freight.alphasolutions.software"
          >
            support@freight.alphasolutions.software
          </a>
          .
        </p>
        <CarrierOnboardingDocsPanel heading="Documents & rejection details" />
        <FreightSignOutLink />
        <Link
          href="/login"
          className="mt-4 block text-xs text-[var(--color-muted)] underline"
        >
          Return to login chooser
        </Link>
      </div>
    </main>
  );
}
