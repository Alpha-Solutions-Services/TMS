import { NextRequest, NextResponse } from "next/server";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const carrierProfileId = req.nextUrl.searchParams.get("carrierProfileId")?.trim();
  const companyName = req.nextUrl.searchParams.get("companyName")?.trim();

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });

  let profileId: string | null | undefined = carrierProfileId;

  if (!profileId && companyName) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "carrier")
      .ilike("company_name", companyName)
      .maybeSingle();
    profileId = (profile?.id as string) || null;
  }

  if (!profileId) {
    return NextResponse.json({ drivers: [] });
  }

  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, email, phone")
    .eq("role", "driver")
    .eq("carrier_id", profileId)
    .order("full_name");

  if (error) {
    return NextResponse.json({ error: "Could not load drivers" }, { status: 500 });
  }

  return NextResponse.json({
    drivers: (data ?? []).map((d) => ({
      id: d.id as string,
      name: (d.full_name as string) || "Driver",
      email: (d.email as string) || "",
      phone: (d.phone as string) || "",
    })),
  });
}
