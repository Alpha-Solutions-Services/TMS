import type { User } from "@supabase/supabase-js";
import type { CarrierRosterEntry } from "./carrier-sheet";
import { fetchCarrierSheetCsv, parseCarrierCsv } from "./carrier-sheet";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

type DispatcherUser = Pick<User, "id"> & { email?: string | null };

type DbCarrier = {
  id: string;
  active: boolean;
  mc: string | null;
  mc_age: string | null;
  contact_name: string | null;
  phone: string | null;
  company_name: string;
  truck: string | null;
  email: string | null;
  address: string | null;
  dispatch_review: string | null;
  status: string | null;
  sales_review: string | null;
  sales_attention: string | null;
  document_link: string | null;
  source: string;
};

function dbToEntry(row: DbCarrier): CarrierRosterEntry {
  return {
    id: row.id,
    source: row.source === "sheet" ? "sheet" : "dispatcher",
    active: row.active,
    mc: row.mc ?? "",
    mcAge: row.mc_age ?? "",
    contactName: row.contact_name ?? "",
    phone: row.phone ?? "",
    companyName: row.company_name,
    truck: row.truck ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    dispatchReview: row.dispatch_review ?? "",
    status: row.status ?? "",
    salesReview: row.sales_review ?? "",
    salesAttention: row.sales_attention ?? "",
    documentLink: row.document_link ?? "",
  };
}

function sheetToEntry(row: ReturnType<typeof parseCarrierCsv>[number], index: number): CarrierRosterEntry {
  return {
    id: `sheet-${index}-${row.companyName}`,
    source: "sheet",
    active: true,
    ...row,
  };
}

export async function loadCarrierRoster(): Promise<{
  carriers: CarrierRosterEntry[];
  sheetConnected: boolean;
  sheetSource: string;
}> {
  const merged = new Map<string, CarrierRosterEntry>();
  let sheetConnected = false;
  let sheetSource = "none";

  try {
    const { csv, source } = await fetchCarrierSheetCsv();
    if (csv) {
      sheetConnected = true;
      sheetSource = source;
      parseCarrierCsv(csv).forEach((row, i) => {
        merged.set(row.companyName.toLowerCase(), sheetToEntry(row, i));
      });
    }
  } catch (e) {
    console.error("[carrier-roster] sheet fetch failed:", e);
  }

  const sb = getServiceRoleClient();
  if (sb) {
    const { data, error } = await sb
      .from("dispatch_carrier_roster")
      .select("*")
      .eq("active", true)
      .order("company_name", { ascending: true });

    if (error) {
      console.warn("[carrier-roster] DB read skipped:", error.message);
    }

    for (const row of (data ?? []) as DbCarrier[]) {
      const entry = dbToEntry(row);
      merged.set(entry.companyName.toLowerCase(), entry);
    }
  }

  return {
    carriers: Array.from(merged.values()).sort((a, b) =>
      a.companyName.localeCompare(b.companyName),
    ),
    sheetConnected,
    sheetSource,
  };
}

export type DriverRosterEntry = {
  id: string;
  driverName: string;
  driverEmail: string;
  driverPhone: string;
  carrierCompanyName: string;
  carrierRosterId: string | null;
  carrierProfileId: string | null;
  assignedDispatcherId: string | null;
  active: boolean;
  notes: string;
  /** roster | portal — portal = invited profiles.carrier_id drivers */
  source?: "roster" | "portal";
  profileId?: string | null;
  driverStatus?: string | null;
  defaultDriverPayPercent?: number | null;
};

type RosterRow = {
  id: string;
  driver_name: string;
  driver_email: string | null;
  driver_phone: string | null;
  carrier_company_name: string;
  carrier_roster_id: string | null;
  carrier_profile_id: string | null;
  assigned_dispatcher_id: string | null;
  active: boolean;
  notes: string | null;
};

function mapRosterRow(row: RosterRow): DriverRosterEntry {
  return {
    id: row.id,
    driverName: row.driver_name,
    driverEmail: row.driver_email ?? "",
    driverPhone: row.driver_phone ?? "",
    carrierCompanyName: row.carrier_company_name,
    carrierRosterId: row.carrier_roster_id,
    carrierProfileId: row.carrier_profile_id,
    assignedDispatcherId: row.assigned_dispatcher_id ?? null,
    active: row.active,
    notes: row.notes ?? "",
    source: "roster",
    profileId: null,
    driverStatus: null,
    defaultDriverPayPercent: null,
  };
}

export async function loadDriverRoster(): Promise<DriverRosterEntry[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  // Active + inactive so terminated drivers stay visible for revive.
  const { data, error } = await sb
    .from("dispatch_driver_roster")
    .select("*")
    .order("driver_name", { ascending: true });

  if (error) {
    console.warn("[driver-roster] DB read skipped:", error.message);
    return [];
  }

  const allRows = (data ?? []) as RosterRow[];
  const activeRows = allRows.filter((r) => r.active);
  const inactiveByEmail = new Map<string, RosterRow>();
  for (const row of allRows) {
    if (row.active) continue;
    const email = (row.driver_email ?? "").trim().toLowerCase();
    if (email) inactiveByEmail.set(email, row);
  }

  const roster: DriverRosterEntry[] = activeRows.map(mapRosterRow);

  // Include terminated/suspended portal drivers so supers/dispatchers can revive.
  const { data: portalDrivers } = await sb
    .from("profiles")
    .select(
      "id, full_name, email, phone, carrier_id, driver_status, default_driver_pay_percent, company_name",
    )
    .eq("role", "driver");

  const carrierIds = Array.from(
    new Set(
      (portalDrivers ?? [])
        .map((d) => d.carrier_id as string | null)
        .filter(Boolean) as string[],
    ),
  );
  const carrierNames = new Map<string, string>();
  if (carrierIds.length) {
    const { data: carriers } = await sb
      .from("profiles")
      .select("id, company_name, full_name")
      .in("id", carrierIds);
    for (const c of carriers ?? []) {
      carrierNames.set(
        c.id as string,
        (c.company_name as string) || (c.full_name as string) || "Carrier",
      );
    }
  }

  const byEmail = new Set(
    roster.map((r) => r.driverEmail.trim().toLowerCase()).filter(Boolean),
  );
  const byProfileCarrier = new Set(
    roster
      .filter((r) => r.carrierProfileId)
      .map((r) => `${r.driverEmail.trim().toLowerCase()}|${r.carrierProfileId}`),
  );

  for (const d of portalDrivers ?? []) {
    const email = ((d.email as string) || "").trim().toLowerCase();
    const carrierId = (d.carrier_id as string) || null;
    const status = ((d.driver_status as string) || "active").toLowerCase();
    const dedupeKey = `${email}|${carrierId}`;

    if (email && byEmail.has(email) && (!carrierId || byProfileCarrier.has(dedupeKey))) {
      const match = roster.find((r) => r.driverEmail.trim().toLowerCase() === email);
      if (match) {
        match.profileId = d.id as string;
        match.driverStatus = (d.driver_status as string) || "active";
        match.defaultDriverPayPercent =
          d.default_driver_pay_percent == null
            ? null
            : Number(d.default_driver_pay_percent);
        if (!match.carrierCompanyName && carrierId) {
          match.carrierCompanyName = carrierNames.get(carrierId) || match.carrierCompanyName;
        }
        if (!match.carrierProfileId && carrierId) match.carrierProfileId = carrierId;
      }
      continue;
    }

    // Re-surface inactive roster row (preserves assigned dispatcher).
    const inactive = email ? inactiveByEmail.get(email) : undefined;
    if (inactive) {
      const restored = mapRosterRow(inactive);
      restored.profileId = d.id as string;
      restored.driverStatus = (d.driver_status as string) || "active";
      restored.defaultDriverPayPercent =
        d.default_driver_pay_percent == null
          ? null
          : Number(d.default_driver_pay_percent);
      if (carrierId) {
        restored.carrierProfileId = restored.carrierProfileId || carrierId;
        restored.carrierCompanyName =
          restored.carrierCompanyName ||
          carrierNames.get(carrierId) ||
          restored.carrierCompanyName;
      }
      roster.push(restored);
      if (email) byEmail.add(email);
      continue;
    }

    roster.push({
      id: `portal-${d.id}`,
      driverName: (d.full_name as string) || "Driver",
      driverEmail: (d.email as string) || "",
      driverPhone: (d.phone as string) || "",
      carrierCompanyName: carrierId
        ? carrierNames.get(carrierId) || "Carrier"
        : (d.company_name as string) || "Unassigned",
      carrierRosterId: null,
      carrierProfileId: carrierId,
      assignedDispatcherId: null,
      active: status === "active",
      notes: "Portal driver",
      source: "portal",
      profileId: d.id as string,
      driverStatus: (d.driver_status as string) || "active",
      defaultDriverPayPercent:
        d.default_driver_pay_percent == null
          ? null
          : Number(d.default_driver_pay_percent),
    });
  }

  return roster.sort((a, b) => a.driverName.localeCompare(b.driverName));
}

/** Same role resolution as portal layout — includes env-based super dispatchers. */
export async function assertDispatcher(user: DispatcherUser): Promise<boolean> {
  const role = await resolveTmsRole(user as User);
  return isDispatcherRole(role);
}

export async function resolveDispatcherTmsRole(
  user: DispatcherUser,
): Promise<"super_dispatcher" | "dispatcher" | "sub_dispatcher" | null> {
  const role = await resolveTmsRole(user as User);
  if (
    role === "super_dispatcher" ||
    role === "dispatcher" ||
    role === "sub_dispatcher"
  ) {
    return role;
  }
  return null;
}
