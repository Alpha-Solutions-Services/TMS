import type { DashboardAlert } from "./dispatch-dashboard-types";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

type RosterRow = {
  company_name: string;
  insurance_expires_at: string | null;
  w9_on_file: boolean | null;
};

export async function fetchCarrierComplianceAlerts(): Promise<DashboardAlert[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("dispatch_carrier_roster")
    .select("company_name, insurance_expires_at, w9_on_file")
    .eq("active", true);

  if (error) {
    console.warn("[carrier-compliance] skipped:", error.message);
    return [];
  }

  const alerts: DashboardAlert[] = [];
  const now = new Date();
  const warnDays = 30;
  const warnCutoff = new Date(now);
  warnCutoff.setDate(warnCutoff.getDate() + warnDays);

  for (const row of (data ?? []) as RosterRow[]) {
    const company = row.company_name?.trim() || "Carrier";
    if (row.insurance_expires_at) {
      const exp = new Date(row.insurance_expires_at);
      if (exp < now) {
        alerts.push({
          type: "insurance_expired",
          message: `${company} — insurance expired ${exp.toLocaleDateString()}`,
          severity: "high",
        });
      } else if (exp <= warnCutoff) {
        alerts.push({
          type: "insurance_expiring",
          message: `${company} — insurance expires ${exp.toLocaleDateString()}`,
          severity: "medium",
        });
      }
    }
    if (row.w9_on_file === false) {
      alerts.push({
        type: "w9_missing",
        message: `${company} — W-9 not on file`,
        severity: "medium",
      });
    }
  }

  return alerts;
}
