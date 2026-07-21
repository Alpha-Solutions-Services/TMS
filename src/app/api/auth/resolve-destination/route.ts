import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { canAccessDispatcherPortal, resolveTmsRole } from "@/lib/tms/auth";
import { dispatcherLandingPath } from "@/lib/tms/permissions";

export const dynamic = "force-dynamic";

/**
 * Resolves post-login destination from the real profile (service role),
 * so OAuth / RLS timing cannot send carriers to the wrong portal.
 */
export async function GET() {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Auth unavailable", path: "/login" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized", path: "/login" }, { status: 401 });
  }

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

  const role = profile?.role as string | undefined;
  const status = profile?.carrier_status as string | undefined;

  if (role === "carrier") {
    if (status === "verified") {
      return NextResponse.json({ path: "/carrier/dashboard", role: "carrier", status });
    }
    if (status === "rejected") {
      return NextResponse.json({ path: "/carrier/rejected", role: "carrier", status });
    }
    if (status === "suspended") {
      return NextResponse.json({ path: "/carrier/suspended", role: "carrier", status });
    }
    return NextResponse.json({ path: "/carrier/pending", role: "carrier", status: status ?? "pending" });
  }

  if (role === "driver") {
    return NextResponse.json({ path: "/driver/dashboard", role: "driver" });
  }

  if (await canAccessDispatcherPortal(user)) {
    const tmsRole = await resolveTmsRole(user);
    return NextResponse.json({
      path: dispatcherLandingPath(tmsRole),
      role: tmsRole ?? "dispatcher",
    });
  }

  if (role === "client" || !role) {
    return NextResponse.json({ path: "/carrier/register", role: role ?? "client" });
  }

  return NextResponse.json({ path: "/login", role: role ?? null });
}
