import { NextResponse } from "next/server";
import { buildCarrierDashboard } from "@/lib/freight/build-carrier-dashboard";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status, company_name, mc_number, full_name")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "carrier" || profile.carrier_status !== "verified") {
    return NextResponse.json({ error: "Verified carrier only" }, { status: 403 });
  }

  const data = await buildCarrierDashboard({
    companyName: profile.company_name?.trim() || "ABC Trucking LLC",
    mcNumber: profile.mc_number?.trim(),
    ownerName: profile.full_name?.trim(),
    carrierProfileId: user.id,
  });

  return NextResponse.json(data);
}
