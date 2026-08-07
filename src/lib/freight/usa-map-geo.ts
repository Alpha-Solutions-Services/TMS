/** Geocode US ZIP via Nominatim (cached in-process). */

const cache = new Map<string, { lat: number; lng: number; at: number }>();
const TTL_MS = 1000 * 60 * 60 * 24;

export async function geocodeUsZip(
  zipRaw: string,
): Promise<{ lat: number; lng: number } | null> {
  const zip = zipRaw.replace(/\D/g, "").slice(0, 5);
  if (zip.length < 5) return null;

  const hit = cache.get(zip);
  if (hit && Date.now() - hit.at < TTL_MS) {
    return { lat: hit.lat, lng: hit.lng };
  }

  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("postalcode", zip);
    url.searchParams.set("country", "US");
    url.searchParams.set("format", "json");
    url.searchParams.set("limit", "1");

    const res = await fetch(url.toString(), {
      headers: {
        "User-Agent": "AlphaFreightTMS/1.0 (fleet-map)",
        Accept: "application/json",
      },
      cache: "force-cache",
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { lat: string; lon: string }[];
    if (!json?.length) return null;
    const lat = Number(json[0].lat);
    const lng = Number(json[0].lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    cache.set(zip, { lat, lng, at: Date.now() });
    return { lat, lng };
  } catch {
    return null;
  }
}

/** Contiguous US approximate bounds for stylized fleet map image. */
export const CONUS_BOUNDS = {
  minLat: 24.4,
  maxLat: 49.4,
  minLng: -124.8,
  maxLng: -66.9,
} as const;

/**
 * Map lat/lng → percent position on `/usa-fleet-map.png`.
 * Image has AK/HI insets bottom-left; CONUS occupies most of the frame.
 */
export function conusLatLngToPercent(
  lat: number,
  lng: number,
): { left: number; top: number } | null {
  const { minLat, maxLat, minLng, maxLng } = CONUS_BOUNDS;
  if (lat < minLat - 2 || lat > maxLat + 2 || lng < minLng - 2 || lng > maxLng + 2) {
    return null;
  }
  const x = (lng - minLng) / (maxLng - minLng);
  const y = (maxLat - lat) / (maxLat - minLat);
  // Content box inside frame (leave room for insets / labels)
  const left = 3 + Math.min(1, Math.max(0, x)) * 94;
  const top = 6 + Math.min(1, Math.max(0, y)) * 72;
  return { left, top };
}
