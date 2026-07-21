import { NextRequest, NextResponse } from "next/server";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type DriverOption = { id: string; name: string; email: string; phone: string; source: string };

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
  const includeAll = req.nextUrl.searchParams.get("all") === "1";

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });

  const byId = new Map<string, DriverOption>();

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

  if (profileId) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "driver")
      .eq("carrier_id", profileId)
      .order("full_name");

    for (const d of data ?? []) {
      byId.set(d.id as string, {
        id: d.id as string,
        name: (d.full_name as string) || "Driver",
        email: (d.email as string) || "",
        phone: (d.phone as string) || "",
        source: "carrier",
      });
    }
  }

  if (companyName) {
    const { data: roster } = await admin
      .from("dispatch_driver_roster")
      .select("driver_name, driver_email, driver_phone")
      .eq("active", true)
      .ilike("carrier_company_name", companyName);

    for (const row of roster ?? []) {
      const email = ((row.driver_email as string) || "").trim().toLowerCase();
      if (!email) continue;
      const { data: profile } = await admin
        .from("profiles")
        .select("id, full_name, email, phone")
        .eq("role", "driver")
        .ilike("email", email)
        .maybeSingle();
      if (!profile?.id || byId.has(profile.id as string)) continue;
      byId.set(profile.id as string, {
        id: profile.id as string,
        name: (profile.full_name as string) || (row.driver_name as string) || "Driver",
        email: (profile.email as string) || email,
        phone: (profile.phone as string) || (row.driver_phone as string) || "",
        source: "roster",
      });
    }
  }

  // Always include full driver list so assign works even when company names differ.
  if (includeAll || byId.size === 0) {
    const { data: allDrivers } = await admin
      .from("profiles")
      .select("id, full_name, email, phone")
      .eq("role", "driver")
      .order("full_name");

    for (const d of allDrivers ?? []) {
      if (byId.has(d.id as string)) continue;
      byId.set(d.id as string, {
        id: d.id as string,
        name: (d.full_name as string) || "Driver",
        email: (d.email as string) || "",
        phone: (d.phone as string) || "",
        source: "all",
      });
    }
  }

  const drivers = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));
  return NextResponse.json({ drivers });
}
