import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { isCarrierIdentity } from "@/lib/freight/carrier-identity";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { fetchDrivingRoute } from "@/lib/freight/road-route";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});

const schema = z
  .object({
    /** Preferred: ordered stops (PU1 → PU2 → DEL1 → …) */
    waypoints: z.array(pointSchema).min(2).max(25).optional(),
    fromLat: z.number().optional(),
    fromLng: z.number().optional(),
    toLat: z.number().optional(),
    toLng: z.number().optional(),
  })
  .superRefine((body, ctx) => {
    if (body.waypoints?.length) return;
    if (
      body.fromLat == null ||
      body.fromLng == null ||
      body.toLat == null ||
      body.toLng == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "waypoints or from/to required",
      });
    }
  });

async function canUseGeo(userId: string): Promise<boolean> {
  const sb = await createClient();
  if (!sb) return false;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id || user.id !== userId) return false;
  if (await assertDispatcher(user)) return true;

  const admin = getServiceRoleClient();
  if (!admin) return false;
  const { data: profile } = await admin
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", userId)
    .maybeSingle();
  return Boolean(profile && isCarrierIdentity(profile));
}

/** POST — driving route polyline along roads (OSRM). Never invents a straight line. */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "geo-route", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await canUseGeo(user.id))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = schema.parse(await req.json());
    const points =
      body.waypoints ??
      ([
        { lat: body.fromLat!, lng: body.fromLng! },
        { lat: body.toLat!, lng: body.toLng! },
      ] as const);

    const route = await fetchDrivingRoute([...points]);
    if (!route) {
      return NextResponse.json(
        {
          error:
            "Road router unavailable — could not build a driving route. Try again in a moment.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      coordinates: route.coordinates,
      distanceMiles: route.distanceMiles,
      durationMin: route.durationMin,
      pointCount: route.coordinates.length,
      fallback: false,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    console.error("[geo/route]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
