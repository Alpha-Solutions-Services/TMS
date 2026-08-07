import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/freight/api-security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

/** GET — driver polls for pending dispatcher location requests */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "driver-location-pending", 120)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("role, driver_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "driver") {
    return NextResponse.json({ error: "Driver only" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  // Expire stale pending
  await admin
    .from("tms_location_requests")
    .update({ status: "expired" })
    .eq("driver_profile_id", user.id)
    .eq("status", "pending")
    .lt("expires_at", new Date().toISOString());

  const { data } = await admin
    .from("tms_location_requests")
    .select("id, load_id, created_at, expires_at")
    .eq("driver_profile_id", user.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false })
    .limit(5);

  return NextResponse.json({
    requests: (data ?? []).map((r) => ({
      id: r.id as string,
      loadId: (r.load_id as string | null) ?? null,
      createdAt: r.created_at as string,
      expiresAt: r.expires_at as string,
    })),
  });
}
