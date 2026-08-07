import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";

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
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** GET — dispatcher sees latest driver locations */
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
  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data, error } = await admin
    .from("tms_driver_locations")
    .select("driver_profile_id, load_id, lat, lng, accuracy_m, updated_at")
    .order("updated_at", { ascending: false })
    .limit(200);

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

  return NextResponse.json({ locations });
}
