import type { CarrierCompliance, CarrierDashboardData, CarrierSummary } from "./carrier-dashboard-types";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

/** Fields dispatchers edit in the portal UI — never fake loads/drivers. */
export type CarrierPortalConfig = {
  trucks?: CarrierDashboardData["trucks"];
  compliance?: Partial<CarrierCompliance>;
  dispatcher?: CarrierDashboardData["dispatcher"];
  /** Optional KPI overrides on top of auto-calculated values from real loads. */
  summary_overrides?: Partial<CarrierSummary>;
  payments?: Partial<CarrierDashboardData["payments"]>;
  fuel_expense_month?: number;
  maintenance_alerts?: number;
};

export async function fetchCarrierPortalConfig(opts: {
  companyName: string;
  carrierProfileId?: string;
}): Promise<CarrierPortalConfig | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  let query = admin.from("dispatch_carrier_portal").select("portal_config");

  if (opts.carrierProfileId) {
    query = query.eq("carrier_profile_id", opts.carrierProfileId);
  } else {
    query = query.ilike("company_name", opts.companyName);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data?.portal_config) return null;
  return data.portal_config as CarrierPortalConfig;
}

export async function upsertCarrierPortalConfig(opts: {
  companyName: string;
  carrierProfileId?: string;
  portalConfig: CarrierPortalConfig;
  updatedBy: string;
}): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) return false;

  const { data: existing } = await admin
    .from("dispatch_carrier_portal")
    .select("id")
    .ilike("company_name", opts.companyName)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await admin
      .from("dispatch_carrier_portal")
      .update({
        portal_config: opts.portalConfig,
        updated_by: opts.updatedBy,
        carrier_profile_id: opts.carrierProfileId ?? null,
      })
      .eq("id", existing.id);
    return !error;
  }

  const { error } = await admin.from("dispatch_carrier_portal").insert({
    company_name: opts.companyName.trim(),
    carrier_profile_id: opts.carrierProfileId ?? null,
    portal_config: opts.portalConfig,
    updated_by: opts.updatedBy,
  });

  return !error;
}

export function mergePortalConfig(
  base: CarrierDashboardData,
  config: CarrierPortalConfig | null,
): CarrierDashboardData {
  if (!config) return base;

  return {
    ...base,
    summary: config.summary_overrides
      ? { ...base.summary, ...config.summary_overrides }
      : base.summary,
    trucks: config.trucks ?? base.trucks,
    compliance: { ...base.compliance, ...config.compliance },
    dispatcher: { ...base.dispatcher, ...config.dispatcher },
    payments: config.payments ? { ...base.payments, ...config.payments } : base.payments,
    fuel_expense_month: config.fuel_expense_month ?? base.fuel_expense_month,
    maintenance_alerts: config.maintenance_alerts ?? base.maintenance_alerts,
    data_source: "live",
  };
}
