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
};

export async function loadDriverRoster(): Promise<DriverRosterEntry[]> {
  const sb = getServiceRoleClient();
  if (!sb) return [];

  const { data, error } = await sb
    .from("dispatch_driver_roster")
    .select("*")
    .eq("active", true)
    .order("driver_name", { ascending: true });

  if (error) {
    console.warn("[driver-roster] DB read skipped:", error.message);
    return [];
  }

  return ((data ?? []) as {
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
  }[]).map((row) => ({
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
  }));
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
