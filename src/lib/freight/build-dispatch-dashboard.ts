import type { DispatchDashboardData } from "./dispatch-dashboard-types";
import { enrichLoadsWithCarrierRoster } from "./carrier-contact";
import { buildTopBookers } from "./carrier-sheet";
import {
  buildDashboardFromRows,
  fetchDispatchSheetCsv,
  parseDispatchCsv,
} from "./dispatch-sheet";
import {
  dbDispatchLoadToSheetRow,
  dbLoadToDashboardLoad,
  fetchDispatchLoadsFromDb,
  listDispatchMonthTabsFromDb,
  reassignMonthTabsFromRcDates,
} from "./dispatch-loads-db";
import { loadCarrierRoster, loadDriverRoster } from "./dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { buildInvoiceAging } from "./dispatch-reports";
import { listSentInvoices } from "./dispatch-sent-invoices-db";
import { listMonthTabOptions, parseMonthTab, resolveActiveMonthTab } from "./dispatch-sheet-tabs";

function mergeAvailableTabs(dbTabs: string[]): string[] {
  const configured = listMonthTabOptions();
  const set = new Set([...configured, ...dbTabs]);
  return Array.from(set).sort((a, b) => {
    const da = parseMonthTab(a);
    const db = parseMonthTab(b);
    if (da && db) return da.getTime() - db.getTime();
    return a.localeCompare(b);
  });
}

function attachLoadsToRoster(
  roster: DispatchDashboardData["carrier_roster"],
  loads: DispatchDashboardData["loads"],
): DispatchDashboardData["carrier_roster"] {
  const counts = new Map<string, number>();
  for (const load of loads) {
    const key = load.carrier.trim().toLowerCase();
    if (!key || key === "—") continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return roster.map((c) => ({
    ...c,
    loadsBooked: counts.get(c.companyName.toLowerCase()) ?? 0,
  }));
}

function finalizeDashboard(
  dashboard: DispatchDashboardData,
  opts: {
    pendingCarriers: number;
    carrierRosterResult: Awaited<ReturnType<typeof loadCarrierRoster>>;
    driverRoster: Awaited<ReturnType<typeof loadDriverRoster>>;
    supabaseCarriers: DispatchDashboardData["carriers"];
    source: "supabase" | "sheet";
  },
): DispatchDashboardData {
  dashboard.top_bookers = buildTopBookers(
    dashboard.loads.map((l) => ({
      booked_by: l.booked_by,
      rate: l.rate,
      dispatch_fee: l.dispatch_fee,
    })),
  );
  dashboard.carrier_roster = attachLoadsToRoster(
    opts.carrierRosterResult.carriers,
    dashboard.loads,
  );
  dashboard.driver_roster = opts.driverRoster;
  dashboard.sheet_meta.carrier_sheet_connected = opts.carrierRosterResult.sheetConnected;
  dashboard.sheet_meta.source = opts.source;

  const mergedCarriers = [...dashboard.carriers];
  for (const sc of opts.supabaseCarriers) {
    if (!mergedCarriers.some((c) => c.company_name === sc.company_name)) {
      mergedCarriers.push(sc);
    }
  }
  dashboard.carriers = mergedCarriers;
  dashboard.footer_stats.carriers_managed = Math.max(
    dashboard.footer_stats.carriers_managed,
    dashboard.carrier_roster.length,
  );
  return dashboard;
}

async function applyAvailableTabs(dashboard: DispatchDashboardData): Promise<DispatchDashboardData> {
  const [dbTabs, sentInvoices] = await Promise.all([
    listDispatchMonthTabsFromDb(),
    listSentInvoices().catch(() => []),
  ]);
  dashboard.sheet_meta.available_tabs = mergeAvailableTabs(dbTabs);
  dashboard.invoice_aging = buildInvoiceAging(sentInvoices);
  return dashboard;
}

export async function buildDispatchDashboard(
  requestedTab?: string | null,
): Promise<DispatchDashboardData> {
  let pendingCarriers = 0;
  const supabaseCarriers: DispatchDashboardData["carriers"] = [];

  const sb = await createClient();
  if (sb) {
    const { count } = await sb
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("role", "carrier")
      .eq("carrier_status", "pending");
    pendingCarriers = count ?? 0;

    const { data: verified } = await sb
      .from("profiles")
      .select("id,company_name,full_name,carrier_status")
      .eq("role", "carrier")
      .eq("carrier_status", "verified")
      .order("company_name", { ascending: true });

    for (const c of verified ?? []) {
      supabaseCarriers.push({
        carrier_id: c.id,
        company_name: c.company_name || c.full_name || "Unnamed carrier",
        equipment: "—",
        location: "—",
        status: "Verified",
        loads_count: 0,
        source: "supabase",
      });
    }
  }

  const [carrierRosterResult, driverRoster] = await Promise.all([
    loadCarrierRoster(),
    loadDriverRoster(),
  ]);

  const activeTab = requestedTab?.trim() || resolveActiveMonthTab();
  const admin = getServiceRoleClient();

  // Supabase is source of truth whenever service role is configured — even with 0 loads.
  if (admin) {
    // Keep month_tab aligned with RC Date (mm/dd/yyyy) so July loads show under July.
    await reassignMonthTabsFromRcDates();

    const dbTabs = await listDispatchMonthTabsFromDb();
    let tab = activeTab;
    // If user did not pick a tab and current month is empty, open the latest month that has loads.
    if (!requestedTab?.trim() && dbTabs.length > 0) {
      const currentRows = await fetchDispatchLoadsFromDb(tab);
      if (currentRows.length === 0) {
        // Prefer latest month that actually has loads (not empty configured months).
        const sorted = [...dbTabs].sort((a, b) => {
          const da = parseMonthTab(a);
          const db = parseMonthTab(b);
          if (da && db) return da.getTime() - db.getTime();
          return a.localeCompare(b);
        });
        tab = sorted[sorted.length - 1] ?? tab;
      }
    }
    const dbRows = await fetchDispatchLoadsFromDb(tab);
    const sheetRows = dbRows.map(dbDispatchLoadToSheetRow);
    const dashboard = buildDashboardFromRows(sheetRows, {
      pendingCarriers,
      sheetConnected: true,
      sheetSource: "supabase",
      activeTab: tab,
    });
    const loads = dbRows.map((row, i) => dbLoadToDashboardLoad(row, i));
    dashboard.loads = enrichLoadsWithCarrierRoster(loads, carrierRosterResult.carriers);
    return applyAvailableTabs(
      finalizeDashboard(dashboard, {
        pendingCarriers,
        carrierRosterResult,
        driverRoster,
        supabaseCarriers,
        source: "supabase",
      }),
    );
  }

  try {
    const { csv, source, activeTab: sheetTab } = await fetchDispatchSheetCsv(requestedTab);
    if (csv) {
      const rows = parseDispatchCsv(csv);
      const dashboard = buildDashboardFromRows(rows, {
        pendingCarriers,
        sheetConnected: true,
        sheetSource: source,
        activeTab: sheetTab,
      });

      dashboard.loads = enrichLoadsWithCarrierRoster(
        dashboard.loads,
        carrierRosterResult.carriers,
      );

      return applyAvailableTabs(
        finalizeDashboard(dashboard, {
          pendingCarriers,
          carrierRosterResult,
          driverRoster,
          supabaseCarriers,
          source: "sheet",
        }),
      );
    }
  } catch (e) {
    console.error("[dispatch-dashboard] sheet fetch failed:", e);
  }

  const empty = buildDashboardFromRows([], {
    pendingCarriers,
    sheetConnected: false,
    sheetSource: "not-configured",
    activeTab: requestedTab ?? "",
  });
  empty.top_bookers = [];
  empty.carrier_roster = carrierRosterResult.carriers;
  empty.driver_roster = driverRoster;
  empty.sheet_meta.carrier_sheet_connected = carrierRosterResult.sheetConnected;
  empty.carriers = supabaseCarriers;
  empty.footer_stats.carriers_managed = supabaseCarriers.length;
  empty.alerts.unshift({
    type: "config",
    message:
      "Supabase service role not configured — set SUPABASE_SERVICE_ROLE_KEY to add and edit loads",
    severity: "high",
  });
  return applyAvailableTabs(empty);
}
