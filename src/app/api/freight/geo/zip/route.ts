import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  zip: z.string().min(3).max(12),
});

/** POST — geocode a US ZIP to lat/lng (Nominatim). */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "geo-zip", 30)) {
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
    const zip = body.zip.replace(/\D/g, "").slice(0, 5);
    if (zip.length < 5) {
      return NextResponse.json({ error: "Enter a 5-digit US ZIP" }, { status: 400 });
    }

    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("postalcode", zip);
    url.searchParams.set("country", "US");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "AlphaFreightTMS/1.0 (dispatcher-tracking)",
        Accept: "application/json",
      },
      next: { revalidate: 86400 },
    });

    if (!res.ok) {
      return NextResponse.json({ error: "Geocoder unavailable" }, { status: 502 });
    }

    const json = (await res.json()) as { lat: string; lon: string; display_name?: string }[];
    if (!json?.length) {
      return NextResponse.json({ error: `ZIP ${zip} not found` }, { status: 404 });
    }

    return NextResponse.json({
      zip,
      lat: Number(json[0].lat),
      lng: Number(json[0].lon),
      label: json[0].display_name ?? zip,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid ZIP" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
