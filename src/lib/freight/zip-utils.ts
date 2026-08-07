/** Extract US ZIP codes from free text (AI paste, RC notes, lane). */
export function extractUsZips(text: string): string[] {
  if (!text) return [];
  const matches = text.match(/\b(\d{5})(?:-\d{4})?\b/g) ?? [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const m of matches) {
    const zip = m.replace(/\D/g, "").slice(0, 5);
    if (zip.length === 5 && !seen.has(zip)) {
      seen.add(zip);
      out.push(zip);
    }
  }
  return out;
}

/**
 * Split extracted ZIPs into pickup vs delivery heuristics:
 * first half → pickup, second half → delivery (odd: extra goes to delivery).
 * If only one ZIP, treat as pickup.
 */
export function splitZipsPickupDelivery(zips: string[]): {
  pickupZips: string[];
  deliveryZips: string[];
} {
  if (!zips.length) return { pickupZips: [], deliveryZips: [] };
  if (zips.length === 1) return { pickupZips: [zips[0]], deliveryZips: [] };
  const mid = Math.ceil(zips.length / 2);
  return {
    pickupZips: zips.slice(0, mid),
    deliveryZips: zips.slice(mid),
  };
}

export function normalizeZipList(input: unknown): string[] {
  if (!input) return [];
  const arr = Array.isArray(input)
    ? input
    : String(input)
        .split(/[,;\s]+/)
        .map((s) => s.trim())
        .filter(Boolean);
  return extractUsZips(arr.join(" "));
}

export type TrackingStop = {
  seq: number;
  kind: "pickup" | "delivery";
  zip: string;
  label?: string;
  lat?: number | null;
  lng?: number | null;
};

export function buildStopsFromZipLists(
  pickupZips: string[],
  deliveryZips: string[],
): TrackingStop[] {
  const stops: TrackingStop[] = [];
  let seq = 0;
  for (const zip of pickupZips) {
    stops.push({ seq: seq++, kind: "pickup", zip, label: `Pickup ${zip}` });
  }
  for (const zip of deliveryZips) {
    stops.push({ seq: seq++, kind: "delivery", zip, label: `Delivery ${zip}` });
  }
  return stops;
}
