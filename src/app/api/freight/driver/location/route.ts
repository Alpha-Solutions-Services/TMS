import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { isVerifiedCarrier } from "@/lib/freight/carrier-identity";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { geocodeUsZip } from "@/lib/freight/usa-map-geo";

const postSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  accuracyM: z.number().optional(),
  loadId: z.string().uuid().optional().nullable(),
});

/** POST — driver shares GPS ping */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "driver-location-post", 60)) {
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
  if (profile.driver_status === "terminated" || profile.driver_status === "suspended") {
    return NextResponse.json({ error: "Driver account inactive" }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const { error } = await admin.from("tms_driver_locations").upsert(
      {
        driver_profile_id: user.id,
        load_id: body.loadId || null,
        lat: body.lat,
        lng: body.lng,
        accuracy_m: body.accuracyM ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "driver_profile_id" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Fulfill any pending dispatcher live-location requests
    await admin
      .from("tms_location_requests")
      .update({
        status: "fulfilled",
        fulfilled_at: new Date().toISOString(),
      })
      .eq("driver_profile_id", user.id)
      .eq("status", "pending");

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — dispatcher (all) or verified carrier (own drivers) see latest locations */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "driver-location-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isDisp = await assertDispatcher(user);
  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", user.id)
    .maybeSingle();
  const asCarrier = !isDisp && isVerifiedCarrier(profile);
  if (!isDisp && !asCarrier) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  /** When carrier: only their drivers */
  let carrierDriverIds: string[] | null = null;
  if (asCarrier) {
    const { data: myDrivers } = await admin
      .from("profiles")
      .select("id")
      .eq("role", "driver")
      .eq("carrier_id", user.id);
    carrierDriverIds = (myDrivers ?? []).map((d) => d.id as string).filter(Boolean);
    if (!carrierDriverIds.length) {
      return NextResponse.json({ locations: [], drivers: [] });
    }
  }

  let locQuery = admin
    .from("tms_driver_locations")
    .select("driver_profile_id, load_id, lat, lng, accuracy_m, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (carrierDriverIds) {
    locQuery = locQuery.in("driver_profile_id", carrierDriverIds);
  }

  const { data, error } = await locQuery;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const driverIds = Array.from(
    new Set((data ?? []).map((r) => r.driver_profile_id as string)),
  );
  const loadIds = Array.from(
    new Set(
      (data ?? [])
        .map((r) => r.load_id as string | null)
        .filter(Boolean) as string[],
    ),
  );

  const names = new Map<string, { name: string; carrier: string }>();
  if (driverIds.length) {
    const { data: drivers } = await admin
      .from("profiles")
      .select("id, full_name, carrier_id, company_name")
      .in("id", driverIds);
    const carrierIds = Array.from(
      new Set(
        (drivers ?? [])
          .map((d) => d.carrier_id as string | null)
          .filter(Boolean) as string[],
      ),
    );
    const carriers = new Map<string, string>();
    if (carrierIds.length) {
      const { data: cs } = await admin
        .from("profiles")
        .select("id, company_name, full_name")
        .in("id", carrierIds);
      for (const c of cs ?? []) {
        carriers.set(
          c.id as string,
          (c.company_name as string) || (c.full_name as string) || "Carrier",
        );
      }
    }
    for (const d of drivers ?? []) {
      names.set(d.id as string, {
        name: (d.full_name as string) || "Driver",
        carrier: d.carrier_id
          ? carriers.get(d.carrier_id as string) || "Carrier"
          : (d.company_name as string) || "—",
      });
    }
  }

  const loads = new Map<string, string>();
  if (loadIds.length) {
    const { data: ls } = await admin
      .from("dispatch_loads")
      .select("id, load_number")
      .in("id", loadIds);
    for (const l of ls ?? []) {
      loads.set(l.id as string, String(l.load_number || ""));
    }
  }

  const cutoff = Date.now() - 1000 * 60 * 60 * 24; // 24h
  const locations = (data ?? [])
    .filter((r) => new Date(r.updated_at as string).getTime() >= cutoff)
    .map((r) => {
      const meta = names.get(r.driver_profile_id as string);
      return {
        driverId: r.driver_profile_id,
        driverName: meta?.name || "Driver",
        carrierName: meta?.carrier || "—",
        loadId: r.load_id,
        loadNumber: r.load_id ? loads.get(r.load_id as string) || null : null,
        lat: Number(r.lat),
        lng: Number(r.lng),
        accuracyM: r.accuracy_m == null ? null : Number(r.accuracy_m),
        updatedAt: r.updated_at,
      };
    });

  // Also list drivers currently assigned to non-delivered loads (for tracking picker)
  let assignedLoads: {
    id: string;
    load_number: string | null;
    assigned_driver_profile_id: string | null;
    company_name: string;
    status: string;
    states: string | null;
    pickup_zips: string[] | null;
    delivery_zips: string[] | null;
    carrier_profile_id?: string | null;
  }[] = [];

  if (asCarrier && carrierDriverIds?.length) {
    const byId = new Map<string, (typeof assignedLoads)[number]>();
    const { data: byCarrier } = await admin
      .from("dispatch_loads")
      .select(
        "id, load_number, assigned_driver_profile_id, company_name, status, states, pickup_zips, delivery_zips, carrier_profile_id",
      )
      .eq("carrier_profile_id", user.id)
      .not("assigned_driver_profile_id", "is", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    for (const row of byCarrier ?? []) byId.set(row.id as string, row as (typeof assignedLoads)[number]);
    const { data: byDrivers } = await admin
      .from("dispatch_loads")
      .select(
        "id, load_number, assigned_driver_profile_id, company_name, status, states, pickup_zips, delivery_zips, carrier_profile_id",
      )
      .in("assigned_driver_profile_id", carrierDriverIds)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    for (const row of byDrivers ?? []) byId.set(row.id as string, row as (typeof assignedLoads)[number]);
    assignedLoads = Array.from(byId.values());
  } else {
    const { data } = await admin
      .from("dispatch_loads")
      .select(
        "id, load_number, assigned_driver_profile_id, company_name, status, states, pickup_zips, delivery_zips, carrier_profile_id",
      )
      .not("assigned_driver_profile_id", "is", null)
      .is("deleted_at", null)
      .order("updated_at", { ascending: false })
      .limit(100);
    assignedLoads = (data ?? []) as typeof assignedLoads;
  }

  const assignedDriverIds = Array.from(
    new Set(
      (assignedLoads ?? [])
        .map((l) => l.assigned_driver_profile_id as string)
        .filter(Boolean),
    ),
  );

  const assignedNames = new Map<string, { name: string; carrier: string }>();
  if (assignedDriverIds.length) {
    const { data: drivers } = await admin
      .from("profiles")
      .select("id, full_name, carrier_id, company_name")
      .in("id", assignedDriverIds);
    const carrierIds = Array.from(
      new Set(
        (drivers ?? [])
          .map((d) => d.carrier_id as string | null)
          .filter(Boolean) as string[],
      ),
    );
    const carriers = new Map<string, string>();
    if (carrierIds.length) {
      const { data: cs } = await admin
        .from("profiles")
        .select("id, company_name, full_name")
        .in("id", carrierIds);
      for (const c of cs ?? []) {
        carriers.set(
          c.id as string,
          (c.company_name as string) || (c.full_name as string) || "Carrier",
        );
      }
    }
    for (const d of drivers ?? []) {
      assignedNames.set(d.id as string, {
        name: (d.full_name as string) || "Driver",
        carrier: d.carrier_id
          ? carriers.get(d.carrier_id as string) || "Carrier"
          : (d.company_name as string) || "—",
      });
    }
  }

  const drivers = await Promise.all(
    (assignedLoads ?? [])
      .filter((l) => {
        const s = String(l.status || "").toLowerCase();
        return !(
          s.includes("deliver") ||
          s === "completed" ||
          s === "complete" ||
          s === "paid"
        );
      })
      .map(async (l) => {
        const did = l.assigned_driver_profile_id as string;
        const meta = assignedNames.get(did);
        const loc = locations.find((x) => x.driverId === did);
        const pickupZips = (l.pickup_zips as string[]) ?? [];
        const deliveryZips = (l.delivery_zips as string[]) ?? [];
        let lat = loc?.lat ?? null;
        let lng = loc?.lng ?? null;
        let pingSource: "gps" | "zip" | "none" = loc ? "gps" : "none";
        if (lat == null || lng == null) {
          const zip = pickupZips[0] || deliveryZips[0];
          if (zip) {
            const geo = await geocodeUsZip(zip);
            if (geo) {
              lat = geo.lat;
              lng = geo.lng;
              pingSource = "zip";
            }
          }
        }
        return {
          driverId: did,
          driverName: meta?.name || "Driver",
          carrierName: meta?.carrier || (l.company_name as string) || "—",
          loadId: l.id as string,
          loadNumber: String(l.load_number || ""),
          lane: (l.states as string) || "",
          lat,
          lng,
          updatedAt: loc?.updatedAt ?? null,
          pickupZips,
          deliveryZips,
          pingSource,
        };
      }),
  );

  return NextResponse.json({ locations, drivers });
}
