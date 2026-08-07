import { createClient } from "@/lib/supabase/server";
import { isCarrierIdentity, isVerifiedCarrier } from "@/lib/freight/carrier-identity";
import { NextResponse } from "next/server";

export async function requireCarrierSession(opts?: { verified?: boolean }) {
  const sb = await createClient();
  if (!sb) {
    return {
      error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }),
    };
  }
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("id, role, carrier_status, company_name, email, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || !isCarrierIdentity(profile)) {
    return {
      error: NextResponse.json({ error: "Carrier only" }, { status: 403 }),
    };
  }
  if (opts?.verified && !isVerifiedCarrier(profile)) {
    return {
      error: NextResponse.json({ error: "Verified carrier only" }, { status: 403 }),
    };
  }

  return { user, profile, sb };
}
