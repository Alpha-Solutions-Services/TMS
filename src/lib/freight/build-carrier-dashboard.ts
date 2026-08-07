import { normalizeCompanyKey } from "./carrier-contact";
import type {
  CarrierDashboardData,
  CarrierLoadRow,
  CarrierSummary,
  RevenuePoint,
} from "./carrier-dashboard-types";
import {
  fetchCarrierPortalConfig,
  mergePortalConfig,
} from "./carrier-portal-db";
import { createEmptyCarrierDashboard } from "./empty-carrier-dashboard";
import {
  dbLoadToDashboardLoad,
  fetchCarrierLoadsFromDb,
} from "./dispatch-loads-db";
import { fetchDispatchSheetCsv, parseDispatchCsv } from "./dispatch-sheet";
import { loadDriverRoster } from "./dispatch-roster";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  fetchCarrierScorecard,
  listActiveAnnouncements,
} from "@/lib/freight/announcements";

function mapSheetRowToLoad(row: {
  loadNumber: string;
  sr: string;
  pickupDateTime: string;
  deliveryDateTime: string;
  rcInvoice: number;
  status: string;
  bookedBy: string;
  miles: number;
}): CarrierLoadRow {
  return {
    load_id: row.loadNumber || `LD-${row.sr}`,
    load_number: row.loadNumber || row.sr,
    pickup: row.pickupDateTime || "—",
    delivery: row.deliveryDateTime || "—",
    rate: row.rcInvoice,
    status: row.status || "Booked",
    dispatcher: row.bookedBy || "Alpha Dispatch",
    miles: row.miles,
  };
}

function computeSummaryFromLoads(loads: CarrierLoadRow[], miles: number): CarrierSummary {
  const revenue = loads.reduce((s, l) => s + l.rate, 0);
  const active = loads.filter(
    (l) => !["delivered", "paid", "completed"].includes(l.status.toLowerCase()),
  ).length;
  const outstanding = loads
    .filter((l) => l.status.toLowerCase() === "unpaid")
    .reduce((s, l) => s + l.rate, 0);

  return {
    weekly_revenue: revenue,
    monthly_revenue: revenue,
    active_loads: active,
    rpm: miles > 0 ? Math.round((revenue / miles) * 100) / 100 : 0,
    miles_driven: miles,
    outstanding_invoices: outstanding,
  };
}

function buildRevenueFromLoads(loads: CarrierLoadRow[]): {
  revenue_weekly: RevenuePoint[];
  revenue_monthly: RevenuePoint[];
  rpm_trend: RevenuePoint[];
} {
  if (!loads.length) {
    return { revenue_weekly: [], revenue_monthly: [], rpm_trend: [] };
  }

  const total = loads.reduce((s, l) => s + l.rate, 0);
  const miles = loads.reduce((s, l) => s + (l.miles ?? 0), 0);
  const rpm = miles > 0 ? Math.round((total / miles) * 100) / 100 : 0;

  return {
    revenue_weekly: [{ label: "This week", amount: total }],
    revenue_monthly: [{ label: "This month", amount: total }],
    rpm_trend: [{ label: "Current", amount: rpm }],
  };
}

function isClosedLoadStatus(status: string) {
  const s = status.toLowerCase();
  return (
    s.includes("deliver") ||
    s === "paid" ||
    s === "completed" ||
    s === "complete" ||
    s.includes("cancel")
  );
}

function pickCurrentLoad(loads: CarrierLoadRow[]): CarrierLoadRow | null {
  const active = loads.filter((l) => !isClosedLoadStatus(l.status));
  if (!active.length) return null;
  return (
    active.find((l) => l.status.toLowerCase().includes("transit")) ??
    active.find((l) => {
      const s = l.status.toLowerCase();
      return s.includes("assign") || s.includes("book") || s.includes("dispatch");
    }) ??
    active[0]
  );
}

function applyLoadsToDashboard(
  dashboard: CarrierDashboardData,
  loads: CarrierLoadRow[],
  miles: number,
): CarrierDashboardData {
  const summary = computeSummaryFromLoads(loads, miles);
  const charts = buildRevenueFromLoads(loads);
  const current = pickCurrentLoad(loads);

  dashboard.loads = loads;
  dashboard.summary = summary;
  dashboard.revenue_weekly = charts.revenue_weekly;
  dashboard.revenue_monthly = charts.revenue_monthly;
  dashboard.rpm_trend = charts.rpm_trend;
  dashboard.payments.unpaid_invoices = summary.outstanding_invoices;
  dashboard.payments.paid_this_month = loads
    .filter((l) => l.status.toLowerCase() === "paid")
    .reduce((s, l) => s + l.rate, 0);
  dashboard.payments.total_earnings_ytd = loads.reduce((s, l) => s + l.rate, 0);

  if (current) {
    dashboard.current_load = {
      load_number: current.load_number,
      pickup: current.pickup,
      delivery: current.delivery,
      rate: current.rate,
      status: current.status,
      eta: "—",
      truck_location: dashboard.trucks[0]?.location,
    };
  } else {
    dashboard.current_load = null;
  }

  return dashboard;
}

function buildTrucksFromFleet(opts: {
  dbRows?: { id: string; truck_trailer: string | null; status: string; states: string | null; assigned_driver_profile_id: string | null }[];
  sheetRows?: { truckTrailer: string; status: string; states: string }[];
  drivers: CarrierDashboardData["drivers"];
  loads: CarrierLoadRow[];
}): CarrierDashboardData["trucks"] {
  const trucks: CarrierDashboardData["trucks"] = [];
  const seen = new Set<string>();
  const driverById = new Map(opts.drivers.map((d) => [d.driver_id, d]));

  const pushTruck = (optsT: {
    id: string;
    number: string;
    driverName: string;
    location: string;
    status: string;
  }) => {
    const key = optsT.number.toLowerCase();
    if (!optsT.number || seen.has(key)) return;
    seen.add(key);
    trucks.push({
      truck_id: optsT.id,
      truck_number: optsT.number,
      driver: optsT.driverName,
      equipment: optsT.number,
      location: optsT.location || "—",
      status: optsT.status,
    });
  };

  for (const row of opts.dbRows ?? []) {
    const tt = (row.truck_trailer || "").trim();
    if (!tt) continue;
    const driver = row.assigned_driver_profile_id
      ? driverById.get(row.assigned_driver_profile_id)
      : undefined;
    pushTruck({
      id: row.id,
      number: tt,
      driverName: driver?.name || "—",
      location: row.states || "—",
      status: isClosedLoadStatus(row.status) ? "Available" : "In Transit",
    });
  }

  for (const row of opts.sheetRows ?? []) {
    const tt = (row.truckTrailer || "").trim();
    if (!tt) continue;
    pushTruck({
      id: `sheet-${tt}`,
      number: tt,
      driverName: "—",
      location: row.states || "—",
      status: isClosedLoadStatus(row.status) ? "Available" : "In Transit",
    });
  }

  // Fallback: one unit per active driver so Fleet overview isn't stuck at 0 trucks
  if (!trucks.length) {
    const activeLoadCount = opts.loads.filter((l) => !isClosedLoadStatus(l.status)).length;
    for (const d of opts.drivers.filter((x) => x.status === "Active")) {
      pushTruck({
        id: d.driver_id,
        number: d.name.split(/\s+/)[0] || "Unit",
        driverName: d.name,
        location: activeLoadCount > 0 ? "On load" : "Awaiting GPS",
        status: activeLoadCount > 0 ? "In Transit" : "Available",
      });
    }
  }

  return trucks;
}

export async function buildCarrierDashboard(opts: {
  companyName: string;
  mcNumber?: string;
  ownerName?: string;
  carrierProfileId?: string;
}): Promise<CarrierDashboardData> {
  let dashboard = createEmptyCarrierDashboard({
    companyName: opts.companyName || "—",
    mcNumber: opts.mcNumber,
    ownerName: opts.ownerName,
    carrierProfileId: opts.carrierProfileId,
  });

  const key = normalizeCompanyKey(opts.companyName || "");

  const dbRows = await fetchCarrierLoadsFromDb({
    companyName: opts.companyName || "",
    carrierProfileId: opts.carrierProfileId,
  });

  if (dbRows.length > 0) {
    const loads = dbRows.map((row, i) => {
      const dl = dbLoadToDashboardLoad(row, i);
      return {
        load_id: dl.load_id,
        db_id: dl.db_id,
        load_number: dl.load_number !== "—" ? dl.load_number : dl.sr,
        pickup: dl.pickup,
        delivery: dl.delivery,
        rate: dl.rate,
        status: dl.status,
        dispatcher: dl.booked_by !== "—" ? dl.booked_by : "Alpha Dispatch",
        miles: dl.miles,
      };
    });
    const miles = dbRows.reduce((s, r) => s + (Number(r.miles) || 0), 0);
    dashboard = applyLoadsToDashboard(dashboard, loads, miles);
    dashboard.data_source = "live";
  } else {
    try {
      const { csv } = await fetchDispatchSheetCsv();
      if (csv && key) {
        const rows = parseDispatchCsv(csv).filter(
          (r) => normalizeCompanyKey(r.companyName) === key,
        );
        if (rows.length > 0) {
          const loads = rows.map(mapSheetRowToLoad);
          const miles = rows.reduce((s, r) => s + r.miles, 0);
          dashboard = applyLoadsToDashboard(dashboard, loads, miles);
          dashboard.data_source = "hybrid";
        }
      }
    } catch (e) {
      console.warn("[carrier-dashboard] sheet merge skipped:", e);
    }
  }

  const driverRoster = await loadDriverRoster();
  const companyDrivers = driverRoster
    .filter((d) => {
      if (opts.carrierProfileId && d.carrierProfileId === opts.carrierProfileId) {
        return true;
      }
      return normalizeCompanyKey(d.carrierCompanyName) === key;
    })
    .map((d) => {
      const profileId =
        d.profileId ||
        (d.id.startsWith("portal-") ? d.id.slice("portal-".length) : null);
      const raw = (d.driverStatus || "active").toLowerCase();
      const status =
        raw === "terminated"
          ? "Terminated"
          : raw === "suspended"
            ? "Suspended"
            : "Active";
      return {
        driver_id: profileId || d.id,
        name: d.driverName,
        phone: d.driverPhone,
        status,
      };
    })
    .filter((d) => {
      // Prefer profile UUIDs for manage actions; keep roster-only rows without portal
      return Boolean(d.driver_id);
    });
  if (companyDrivers.length) {
    dashboard.drivers = companyDrivers;
  }

  const admin = getServiceRoleClient();
  if (admin && opts.carrierProfileId) {
    const { data: driverProfiles } = await admin
      .from("profiles")
      .select("id,full_name,phone,driver_status")
      .eq("role", "driver")
      .eq("carrier_id", opts.carrierProfileId);
    for (const dp of driverProfiles ?? []) {
      const raw = String(dp.driver_status || "active").toLowerCase();
      const status =
        raw === "terminated"
          ? "Terminated"
          : raw === "suspended"
            ? "Suspended"
            : "Active";
      const existing = dashboard.drivers.find((d) => d.driver_id === dp.id);
      if (existing) {
        existing.status = status;
        existing.name = (dp.full_name as string) || existing.name;
        existing.phone = (dp.phone as string) || existing.phone;
      } else {
        dashboard.drivers.push({
          driver_id: dp.id,
          name: (dp.full_name as string) || "Driver",
          phone: (dp.phone as string) || "—",
          status,
        });
      }
    }
  }

  // Build trucks after drivers so units can be attributed
  if (dbRows.length > 0) {
    dashboard.trucks = buildTrucksFromFleet({
      dbRows,
      drivers: dashboard.drivers,
      loads: dashboard.loads,
    });
  } else if (dashboard.loads.length || dashboard.drivers.length) {
    dashboard.trucks = buildTrucksFromFleet({
      drivers: dashboard.drivers,
      loads: dashboard.loads,
    });
  }

  // Refresh current load location once trucks exist
  if (dashboard.current_load && dashboard.trucks[0]?.location) {
    dashboard.current_load.truck_location = dashboard.trucks[0].location;
  }

  const portalConfig = await fetchCarrierPortalConfig({
    companyName: opts.companyName || "",
    carrierProfileId: opts.carrierProfileId,
  });

  dashboard = mergePortalConfig(dashboard, portalConfig);

  if (opts.carrierProfileId) {
    const [scorecard, announcements] = await Promise.all([
      fetchCarrierScorecard(opts.carrierProfileId),
      listActiveAnnouncements("carrier"),
    ]);
    dashboard.scorecard = scorecard;
    dashboard.announcements = announcements.map((a) => ({
      id: a.id,
      title: a.title,
      body: a.body,
    }));
  }

  return dashboard;
}
