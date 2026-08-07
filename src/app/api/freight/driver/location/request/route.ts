import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
  driverId: z.string().uuid(),
  loadId: z.string().uuid().optional().nullable(),
});

/** POST — dispatcher requests live GPS from a driver's phone */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "driver-location-request", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const { data: driver } = await admin
      .from("profiles")
      .select("id, role, driver_status, email, full_name, phone")
      .eq("id", body.driverId)
      .eq("role", "driver")
      .maybeSingle();

    if (!driver) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }
    if (driver.driver_status === "terminated" || driver.driver_status === "suspended") {
      return NextResponse.json({ error: "Driver account inactive" }, { status: 400 });
    }

    // Expire old pending requests for this driver
    await admin
      .from("tms_location_requests")
      .update({ status: "expired" })
      .eq("driver_profile_id", body.driverId)
      .eq("status", "pending");

    const { data: row, error } = await admin
      .from("tms_location_requests")
      .insert({
        driver_profile_id: body.driverId,
        requested_by: user.id,
        load_id: body.loadId || null,
        status: "pending",
        expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      })
      .select("id, created_at, expires_at")
      .single();

    if (error || !row) {
      return NextResponse.json({ error: error?.message ?? "Could not create request" }, { status: 500 });
    }

    // Wake phone: push notification (PWA) + email deep link (browsers block background GPS)
    const { PUBLIC_SITE_URL } = await import("@/lib/freight/constants");
    const openUrl = `${PUBLIC_SITE_URL}/driver/dashboard?live=1`;
    const { pushDriverLiveLocationRequest } = await import("@/lib/freight/driver-push");
    const { sendDriverLiveLocationRequestEmail } = await import("@/lib/freight/emails");

    const [pushResult] = await Promise.all([
      pushDriverLiveLocationRequest(body.driverId).catch(() => ({ sent: 0, skipped: true })),
      driver.email
        ? sendDriverLiveLocationRequestEmail({
            to: driver.email as string,
            driverName: (driver.full_name as string) || "Driver",
            openUrl,
          }).catch(() => null)
        : Promise.resolve(null),
    ]);

    return NextResponse.json({
      ok: true,
      requestId: row.id,
      expiresAt: row.expires_at,
      wake: {
        pushSent: pushResult.sent,
        pushSkipped: pushResult.skipped,
        emailSent: Boolean(driver.email),
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — dispatcher polls whether a request was fulfilled + latest location */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "driver-location-request-get", 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const requestId = req.nextUrl.searchParams.get("requestId");
  const driverId = req.nextUrl.searchParams.get("driverId");
  if (!requestId && !driverId) {
    return NextResponse.json({ error: "requestId or driverId required" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  type LocRequest = {
    id: string;
    status: string;
    driver_profile_id: string;
    fulfilled_at: string | null;
    expires_at: string;
  };

  let request: LocRequest | null = null;

  if (requestId) {
    const { data } = await admin
      .from("tms_location_requests")
      .select("id, status, driver_profile_id, fulfilled_at, expires_at")
      .eq("id", requestId)
      .maybeSingle();
    request = (data as LocRequest | null) ?? null;
  } else if (driverId) {
    const { data } = await admin
      .from("tms_location_requests")
      .select("id, status, driver_profile_id, fulfilled_at, expires_at")
      .eq("driver_profile_id", driverId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    request = (data as LocRequest | null) ?? null;
  }

  if (!request) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  // Auto-expire
  if (
    request.status === "pending" &&
    new Date(request.expires_at).getTime() < Date.now()
  ) {
    await admin
      .from("tms_location_requests")
      .update({ status: "expired" })
      .eq("id", request.id);
    request = { ...request, status: "expired" };
  }

  const { data: loc } = await admin
    .from("tms_driver_locations")
    .select("lat, lng, accuracy_m, updated_at, load_id")
    .eq("driver_profile_id", request.driver_profile_id)
    .maybeSingle();

  return NextResponse.json({
    request: {
      id: request.id,
      status: request.status,
      fulfilledAt: request.fulfilled_at,
      expiresAt: request.expires_at,
    },
    location: loc
      ? {
          lat: Number(loc.lat),
          lng: Number(loc.lng),
          accuracyM: loc.accuracy_m == null ? null : Number(loc.accuracy_m),
          updatedAt: loc.updated_at,
          loadId: loc.load_id,
        }
      : null,
  });
}
