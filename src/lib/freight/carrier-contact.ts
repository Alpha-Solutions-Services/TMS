import type { CarrierRosterEntry } from "./carrier-sheet";
import type { DashboardLoad } from "./dispatch-dashboard-types";

export function normalizeCompanyKey(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[.,']/g, "")
    .replace(/\s+/g, " ")
    .replace(/\b(llc|inc|corp|ltd|co)\b/g, "")
    .trim();
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
