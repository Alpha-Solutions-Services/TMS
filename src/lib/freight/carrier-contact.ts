import type { CarrierRosterEntry } from "./carrier-sheet";
import type { DashboardLoad } from "./dispatch-dashboard-types";

/** Canonical key for matching carrier names across sheet spelling variants. */
export function normalizeCompanyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,']/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(llc|inc|corp|ltd|co|company|limited)\b/g, "")
    // Collapse common plural variants: "Services" vs "Service"
    .replace(/\bservices\b/g, "service")
    .replace(/\btrucking\b/g, "truck")
    .replace(/\btransports\b/g, "transport")
    .replace(/\s+/g, " ")
    .trim();
}

/** Prefer the more complete legal-style spelling for invoice display. */
export function preferCarrierDisplayName(a: string, b: string): string {
  const score = (name: string) => {
    let s = name.trim().length;
    if (/\b(llc|inc|corp|ltd|company)\b/i.test(name)) s += 20;
    if (/[a-z]/.test(name) && /[A-Z]/.test(name)) s += 5; // mixed case over ALL CAPS
    return s;
  };
  return score(a) >= score(b) ? a : b;
}

function isBlank(value: string | undefined | null): boolean {
  const v = value?.trim();
  return !v || v === "—";
}

export function buildCarrierContactIndex(
  roster: CarrierRosterEntry[],
): Map<string, CarrierRosterEntry> {
  const index = new Map<string, CarrierRosterEntry>();

  for (const entry of roster) {
    const name = entry.companyName?.trim();
    if (!name) continue;
    index.set(name.toLowerCase(), entry);
    index.set(normalizeCompanyKey(name), entry);
  }

  return index;
}

export function lookupCarrierContact(
  index: Map<string, CarrierRosterEntry>,
  companyName: string,
): CarrierRosterEntry | undefined {
  const trimmed = companyName.trim();
  if (!trimmed || trimmed === "—") return undefined;

  return (
    index.get(trimmed.toLowerCase()) ?? index.get(normalizeCompanyKey(trimmed))
  );
}

/** Pull email from any load row, then fall back to the Carriers sheet roster. */
export function resolveCarrierEmail(
  loads: DashboardLoad[],
  rosterIndex: Map<string, CarrierRosterEntry>,
): string {
  for (const load of loads) {
    const email = load.email?.trim();
    if (email && email !== "—") return email;
  }

  const carrierName = loads[0]?.carrier;
  if (!carrierName) return "";

  const roster = lookupCarrierContact(rosterIndex, carrierName);
  return roster?.email?.trim() ?? "";
}

export function enrichLoadsWithCarrierRoster(
  loads: DashboardLoad[],
  roster: CarrierRosterEntry[],
): DashboardLoad[] {
  const index = buildCarrierContactIndex(roster);

  return loads.map((load) => {
    const rosterEntry = lookupCarrierContact(index, load.carrier);
    if (!rosterEntry) return load;

    return {
      ...load,
      email: isBlank(load.email) && rosterEntry.email ? rosterEntry.email : load.email,
      phone: isBlank(load.phone) && rosterEntry.phone ? rosterEntry.phone : load.phone,
      broker_agent:
        isBlank(load.broker_agent) && rosterEntry.contactName
          ? rosterEntry.contactName
          : load.broker_agent,
      load_details:
        isBlank(load.load_details) && rosterEntry.address
          ? rosterEntry.address
          : load.load_details,
    };
  });
}
