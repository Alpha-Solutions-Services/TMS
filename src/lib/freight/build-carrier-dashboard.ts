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

function applyLoadsToDashboard(
  dashboard: CarrierDashboardData,
  loads: CarrierLoadRow[],
  miles: number,
): CarrierDashboardData {
  const summary = computeSummaryFromLoads(loads, miles);
  const charts = buildRevenueFromLoads(loads);
  const inTransit = loads.find((l) => l.status.toLowerCase().includes("transit"));

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

  if (inTransit) {
    dashboard.current_load = {
      load_number: inTransit.load_number,
      pickup: inTransit.pickup,
      delivery: inTransit.delivery,
      rate: inTransit.rate,
      status: inTransit.status,
      eta: "—",
      truck_location: dashboard.trucks[0]?.location,
    };
  } else {
    dashboard.current_load = null;
  }

  return dashboard;
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
    .filter((d) => normalizeCompanyKey(d.carrierCompanyName) === key)
    .map((d) => ({
      driver_id: d.id,
      name: d.driverName,
      phone: d.driverPhone,
      status: "Active",
    }));
  if (companyDrivers.length) {
    dashboard.drivers = companyDrivers;
  }

  const admin = getServiceRoleClient();
  if (admin && opts.carrierProfileId) {
    const { data: driverProfiles } = await admin
      .from("profiles")
      .select("id,full_name,phone")
      .eq("role", "driver")
      .eq("carrier_id", opts.carrierProfileId);
    for (const dp of driverProfiles ?? []) {
      if (!dashboard.drivers.some((d) => d.driver_id === dp.id)) {
        dashboard.drivers.push({
          driver_id: dp.id,
          name: (dp.full_name as string) || "Driver",
          phone: (dp.phone as string) || "—",
          status: "Active",
        });
      }
    }
  }

  const portalConfig = await fetchCarrierPortalConfig({
    companyName: opts.companyName || "",
    carrierProfileId: opts.carrierProfileId,
  });

  return mergePortalConfig(dashboard, portalConfig);
}
