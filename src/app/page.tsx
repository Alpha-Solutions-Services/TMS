import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessDispatcherPortal, resolveTmsRole } from "@/lib/tms/auth";
import { dispatcherLandingPath } from "@/lib/tms/permissions";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export default async function HomePage() {
  const sb = await createClient();
  if (!sb) redirect("/login");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  // Prefer profiles.role so carriers are never diverted into dispatcher by env allowlists.
  const admin = getServiceRoleClient();
  const { data: profile } = admin
    ? await admin
        .from("profiles")
        .select("role, carrier_status")
        .eq("id", user.id)
        .maybeSingle()
    : await sb
        .from("profiles")
        .select("role, carrier_status")
        .eq("id", user.id)
        .maybeSingle();

  if (profile?.role === "carrier") {
    if (profile.carrier_status === "verified") redirect("/carrier/dashboard");
    if (profile.carrier_status === "rejected") redirect("/carrier/rejected");
    if (profile.carrier_status === "suspended") redirect("/carrier/suspended");
    redirect("/carrier/pending");
  }

  if (profile?.role === "driver") {
    redirect("/driver/dashboard");
  }

  if (await canAccessDispatcherPortal(user)) {
    const role = await resolveTmsRole(user);
    redirect(dispatcherLandingPath(role));
  }

  redirect("/login");
}
