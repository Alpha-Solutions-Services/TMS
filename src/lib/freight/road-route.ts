/** Road routing via public OSRM-compatible endpoints (driving geometry). */

export type LatLng = { lat: number; lng: number };

export type RoadRouteResult = {
  coordinates: [number, number][]; // [lat, lng] for Leaflet
  distanceMiles: number;
  durationMin: number;
  provider: string;
};

const OSRM_ENDPOINTS = [
  process.env.OSRM_URL?.replace(/\/$/, ""),
  "https://router.project-osrm.org",
  "https://routing.openstreetmap.de/routed-car",
].filter(Boolean) as string[];

/** Decode Google/OSRM encoded polyline → [lat, lng][]. */
export function decodePolyline(encoded: string, precision = 5): [number, number][] {
  const coordinates: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const factor = 10 ** precision;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let b: number;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    result = 0;
    shift = 0;
    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);
    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    coordinates.push([lat / factor, lng / factor]);
  }

  return coordinates;
}

function coordsPath(points: LatLng[]): string {
  return points.map((p) => `${p.lng},${p.lat}`).join(";");
}

async function fetchOsrm(
  base: string,
  points: LatLng[],
): Promise<RoadRouteResult | null> {
  const url =
    `${base}/route/v1/driving/${coordsPath(points)}` +
    `?overview=full&geometries=polyline&steps=false`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "AlphaFreightTMS/1.0 (road-routing)",
      },
      signal: controller.signal,
      cache: "no-store",
    });
    if (!res.ok) return null;

    const json = (await res.json()) as {
      code?: string;
      routes?: {
        distance: number;
        duration: number;
        geometry: string;
      }[];
    };

    if (json.code && json.code !== "Ok") return null;
    const route = json.routes?.[0];
    if (!route?.geometry) return null;

    const coordinates = decodePolyline(route.geometry);
    if (coordinates.length < 2) return null;

    return {
      coordinates,
      distanceMiles: Math.round((route.distance / 1609.344) * 10) / 10,
      durationMin: Math.round(route.duration / 60),
      provider: base,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Driving route through 2+ waypoints. Tries several public OSRM mirrors.
 * Returns null if every provider fails (caller should not invent a straight line).
 */
export async function fetchDrivingRoute(
  points: LatLng[],
): Promise<RoadRouteResult | null> {
  if (points.length < 2) return null;

  // OSRM rejects duplicate consecutive coords
  const cleaned: LatLng[] = [];
  for (const p of points) {
    const prev = cleaned[cleaned.length - 1];
    if (
      prev &&
      Math.abs(prev.lat - p.lat) < 1e-6 &&
      Math.abs(prev.lng - p.lng) < 1e-6
    ) {
      continue;
    }
    cleaned.push(p);
  }
  if (cleaned.length < 2) return null;

  for (const base of OSRM_ENDPOINTS) {
    const result = await fetchOsrm(base, cleaned);
    if (result && result.coordinates.length >= 2) return result;
  }
  return null;
}
