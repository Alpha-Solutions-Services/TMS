import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  fromLat: z.number(),
  fromLng: z.number(),
  toLat: z.number(),
  toLng: z.number(),
});

/** POST — driving route polyline between two points (OSRM). */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "geo-route", 30)) {
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
    const body = schema.parse(await req.json());
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${body.fromLng},${body.fromLat};${body.toLng},${body.toLat}` +
      `?overview=full&geometries=geojson`;

    const res = await fetch(url, {
      headers: { Accept: "application/json" },
    });
    if (!res.ok) {
      return NextResponse.json({ error: "Router unavailable" }, { status: 502 });
    }

    const json = (await res.json()) as {
      routes?: {
        distance: number;
        duration: number;
        geometry: { coordinates: [number, number][] };
      }[];
    };

    const route = json.routes?.[0];
    if (!route) {
      // Fallback straight line
      return NextResponse.json({
        coordinates: [
          [body.fromLat, body.fromLng],
          [body.toLat, body.toLng],
        ],
        distanceMiles: null,
        durationMin: null,
        fallback: true,
      });
    }

    // GeoJSON is [lng, lat] → Leaflet wants [lat, lng]
    const coordinates = route.geometry.coordinates.map(
      ([lng, lat]) => [lat, lng] as [number, number],
    );

    return NextResponse.json({
      coordinates,
      distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
      fallback: false,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid coordinates" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
