import type { CarrierDashboardData } from "./carrier-dashboard-types";
import { FREIGHT_SUPPORT_EMAIL } from "./constants";

const emptyCompliance = {
  insurance_status: "—",
  insurance_expiry: "—",
  mc_authority: "—",
  mc_expiry: "—",
  cdl_expiry: "—",
  ifta_due: "—",
  registration_expiry: "—",
};

export function createEmptyCarrierDashboard(opts: {
  companyName: string;
  mcNumber?: string;
  dotNumber?: string;
  ownerName?: string;
  carrierProfileId?: string;
}): CarrierDashboardData {
  return {
    carrier: {
      carrier_id: opts.carrierProfileId ?? "",
      company_name: opts.companyName || "—",
      mc_number: opts.mcNumber ?? "—",
      dot_number: opts.dotNumber ?? "—",
      owner: opts.ownerName ?? "—",
      status: "Active",
    },
    summary: {
      weekly_revenue: 0,
      monthly_revenue: 0,
      active_loads: 0,
      rpm: 0,
      miles_driven: 0,
      outstanding_invoices: 0,
    },
    current_load: null,
    trucks: [],
    drivers: [],
    loads: [],
    payments: {
      paid_this_month: 0,
      unpaid_invoices: 0,
      factoring_status: "—",
      total_earnings_ytd: 0,
    },
    documents: [],
    compliance: { ...emptyCompliance },
    dispatcher: {
      name: "Alpha Dispatch",
      email: FREIGHT_SUPPORT_EMAIL,
      phone: "—",
    },
    revenue_weekly: [],
    revenue_monthly: [],
    rpm_trend: [],
    fuel_expense_month: 0,
    maintenance_alerts: 0,
    ai_load_recommendations: [],
    data_source: "live",
  };
}
