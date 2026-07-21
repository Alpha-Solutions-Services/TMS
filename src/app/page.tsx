import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { canAccessDispatcherPortal, resolveTmsRole } from "@/lib/tms/auth";
import { dispatcherLandingPath } from "@/lib/tms/permissions";

export default async function HomePage() {
  const sb = await createClient();
  if (!sb) redirect("/login");

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  if (await canAccessDispatcherPortal(user)) {
    const role = await resolveTmsRole(user);
    redirect(dispatcherLandingPath(role));
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", user.id)
    .maybeSingle();

  switch (profile?.role) {
    case "dispatcher":
      redirect("/login?error=terminated");
    case "carrier":
      if (profile.carrier_status === "verified") redirect("/carrier/dashboard");
      if (profile.carrier_status === "rejected") redirect("/carrier/rejected");
      if (profile.carrier_status === "suspended") redirect("/carrier/suspended");
      redirect("/carrier/pending");
    case "driver":
      redirect("/driver/dashboard");
    default:
      redirect("/login");
  }
}
