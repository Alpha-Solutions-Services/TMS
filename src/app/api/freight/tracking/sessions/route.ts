import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import {
  buildStopsFromZipLists,
  normalizeZipList,
  type TrackingStop,
} from "@/lib/freight/zip-utils";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { isVerifiedCarrier } from "@/lib/freight/carrier-identity";

const postSchema = z.object({
  loadId: z.string().uuid(),
  driverId: z.string().uuid(),
  pickupZips: z.array(z.string()).max(20).optional(),
  deliveryZips: z.array(z.string()).max(20).optional(),
  stops: z
    .array(
      z.object({
        seq: z.number().int().min(0),
        kind: z.enum(["pickup", "delivery"]),
        zip: z.string().min(5).max(10),
        label: z.string().max(120).optional(),
        lat: z.number().optional().nullable(),
        lng: z.number().optional().nullable(),
      }),
    )
    .max(40)
    .optional(),
});

async function geocodeStop(
  zip: string,
): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("postalcode", zip.replace(/\D/g, "").slice(0, 5));
    url.searchParams.set("country", "US");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");
    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "AlphaFreightTMS/1.0 (tracking-sessions)",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat: string; lon: string }[];
    if (!json[0]) return null;
    return { lat: Number(json[0].lat), lng: Number(json[0].lon) };
  } catch {
    return null;
  }
}

/** GET — list active tracking sessions (dispatcher: all; carrier: own) */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "tracking-sessions-get", 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const isDisp = await assertDispatcher(user);
  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", user.id)
    .maybeSingle();

  const asCarrier = !isDisp && isVerifiedCarrier(profile);
  if (!isDisp && !asCarrier) {
    // Driver: own active sessions
    if (profile?.role !== "driver") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  let query = admin
    .from("tms_load_tracking_sessions")
    .select(
      "id, load_id, driver_profile_id, carrier_profile_id, status, stops, started_at, ended_at",
    )
    .eq("status", "active")
    .order("started_at", { ascending: false })
    .limit(100);

  if (asCarrier) {
    query = query.eq("carrier_profile_id", user.id);
  } else if (!isDisp && profile?.role === "driver") {
    query = query.eq("driver_profile_id", user.id);
  }

  const { data: sessions, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const loadIds = Array.from(
    new Set((sessions ?? []).map((s) => s.load_id as string)),
  );
  const driverIds = Array.from(
    new Set((sessions ?? []).map((s) => s.driver_profile_id as string)),
  );

  const loads = new Map<
    string,
    { loadNumber: string; company: string; lane: string }
  >();
  if (loadIds.length) {
    const { data } = await admin
      .from("dispatch_loads")
      .select("id, load_number, company_name, load_details, states")
      .in("id", loadIds);
    for (const l of data ?? []) {
      loads.set(l.id as string, {
        loadNumber: String(l.load_number || ""),
        company: String(l.company_name || ""),
        lane: String(l.load_details || l.states || ""),
      });
    }
  }

  const drivers = new Map<string, string>();
  if (driverIds.length) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", driverIds);
    for (const d of data ?? []) {
      drivers.set(d.id as string, (d.full_name as string) || "Driver");
    }
  }

  const locs = new Map<
    string,
    { lat: number; lng: number; updatedAt: string }
  >();
  if (driverIds.length) {
    const { data } = await admin
      .from("tms_driver_locations")
      .select("driver_profile_id, lat, lng, updated_at")
      .in("driver_profile_id", driverIds);
    for (const r of data ?? []) {
      locs.set(r.driver_profile_id as string, {
        lat: Number(r.lat),
        lng: Number(r.lng),
        updatedAt: r.updated_at as string,
      });
    }
  }

  return NextResponse.json({
    sessions: (sessions ?? []).map((s) => {
      const load = loads.get(s.load_id as string);
      const loc = locs.get(s.driver_profile_id as string);
      return {
        id: s.id,
        loadId: s.load_id,
        loadNumber: load?.loadNumber ?? "",
        company: load?.company ?? "",
        lane: load?.lane ?? "",
        driverId: s.driver_profile_id,
        driverName: drivers.get(s.driver_profile_id as string) ?? "Driver",
        carrierProfileId: s.carrier_profile_id,
        status: s.status,
        stops: (s.stops as TrackingStop[]) ?? [],
        startedAt: s.started_at,
        location: loc ?? null,
      };
    }),
  });
}

/** POST — assign multi-stop tracking to a driver (dispatcher) */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "tracking-sessions-post", 30)) {
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

    const { data: load } = await admin
      .from("dispatch_loads")
      .select(
        "id, load_number, assigned_driver_profile_id, carrier_profile_id, pickup_zips, delivery_zips, company_name",
      )
      .eq("id", body.loadId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!load) return NextResponse.json({ error: "Load not found" }, { status: 404 });

    const { data: driver } = await admin
      .from("profiles")
      .select("id, role, carrier_id, driver_status")
      .eq("id", body.driverId)
      .eq("role", "driver")
      .maybeSingle();

    if (!driver) return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    if (driver.driver_status === "terminated" || driver.driver_status === "suspended") {
      return NextResponse.json({ error: "Driver inactive" }, { status: 400 });
    }

    const pickupZips = body.pickupZips?.length
      ? normalizeZipList(body.pickupZips)
      : normalizeZipList(load.pickup_zips as string[] | null);
    const deliveryZips = body.deliveryZips?.length
      ? normalizeZipList(body.deliveryZips)
      : normalizeZipList(load.delivery_zips as string[] | null);

    let stops: TrackingStop[] =
      body.stops?.map((s) => ({
        seq: s.seq,
        kind: s.kind,
        zip: s.zip.replace(/\D/g, "").slice(0, 5),
        label: s.label,
        lat: s.lat,
        lng: s.lng,
      })) ?? buildStopsFromZipLists(pickupZips, deliveryZips);

    if (!stops.length) {
      return NextResponse.json(
        { error: "Add at least one pickup or delivery ZIP" },
        { status: 400 },
      );
    }

    // Geocode stops missing coords
    stops = await Promise.all(
      stops.map(async (s) => {
        if (s.lat != null && s.lng != null) return s;
        const geo = await geocodeStop(s.zip);
        return geo ? { ...s, lat: geo.lat, lng: geo.lng } : s;
      }),
    );

    // Persist zips on load for convenience
    await admin
      .from("dispatch_loads")
      .update({
        pickup_zips: pickupZips.length
          ? pickupZips
          : stops.filter((s) => s.kind === "pickup").map((s) => s.zip),
        delivery_zips: deliveryZips.length
          ? deliveryZips
          : stops.filter((s) => s.kind === "delivery").map((s) => s.zip),
        assigned_driver_profile_id: body.driverId,
        carrier_profile_id:
          (driver.carrier_id as string) ||
          (load.carrier_profile_id as string) ||
          null,
      })
      .eq("id", body.loadId);

    // Complete prior active sessions for this load/driver
    await admin
      .from("tms_load_tracking_sessions")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("load_id", body.loadId)
      .eq("status", "active");

    const { data: session, error } = await admin
      .from("tms_load_tracking_sessions")
      .insert({
        load_id: body.loadId,
        driver_profile_id: body.driverId,
        assigned_by: user.id,
        carrier_profile_id:
          (driver.carrier_id as string) ||
          (load.carrier_profile_id as string) ||
          null,
        status: "active",
        stops,
      })
      .select("id, started_at")
      .single();

    if (error || !session) {
      return NextResponse.json({ error: error?.message ?? "Could not start tracking" }, { status: 500 });
    }

    // Kick a live location request
    await admin
      .from("tms_location_requests")
      .update({ status: "expired" })
      .eq("driver_profile_id", body.driverId)
      .eq("status", "pending");

    await admin.from("tms_location_requests").insert({
      driver_profile_id: body.driverId,
      requested_by: user.id,
      load_id: body.loadId,
      status: "pending",
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Wake driver (push + email) — reuse existing helpers
    try {
      const { pushDriverLiveLocationRequest } = await import("@/lib/freight/driver-push");
      const { sendDriverLiveLocationRequestEmail } = await import("@/lib/freight/emails");
      const { PUBLIC_SITE_URL } = await import("@/lib/freight/constants");
      const { data: dprof } = await admin
        .from("profiles")
        .select("email, full_name")
        .eq("id", body.driverId)
        .maybeSingle();
      await pushDriverLiveLocationRequest(body.driverId).catch(() => null);
      if (dprof?.email) {
        await sendDriverLiveLocationRequestEmail({
          to: dprof.email as string,
          driverName: (dprof.full_name as string) || "Driver",
          openUrl: `${PUBLIC_SITE_URL}/driver/dashboard?live=1`,
        }).catch(() => null);
      }
    } catch {
      /* optional wake */
    }

    return NextResponse.json({
      ok: true,
      sessionId: session.id,
      stops,
      startedAt: session.started_at,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — complete/cancel a session */
export async function PATCH(req: NextRequest) {
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
    const body = z
      .object({
        sessionId: z.string().uuid(),
        status: z.enum(["completed", "cancelled"]),
      })
      .parse(await req.json());

    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const { error } = await admin
      .from("tms_load_tracking_sessions")
      .update({ status: body.status, ended_at: new Date().toISOString() })
      .eq("id", body.sessionId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
