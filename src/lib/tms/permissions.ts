import type { User } from "@supabase/supabase-js";
import type { TmsRole } from "@/lib/tms/roles";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";

/** Super > dispatcher > sub_dispatcher */
export function roleRank(role: TmsRole): number {
  switch (role) {
    case "super_dispatcher":
      return 3;
    case "dispatcher":
      return 2;
    case "sub_dispatcher":
      return 1;
    default:
      return 0;
  }
}

export function canManageTeam(role: TmsRole): boolean {
  return role === "super_dispatcher";
}

export function canApproveLoads(role: TmsRole): boolean {
  return role === "super_dispatcher";
}

export function canInviteCarriersAndDrivers(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canAccessDispatcherNav(role: TmsRole): boolean {
  return roleRank(role) >= 1;
}

export function displayRoleLabel(role: TmsRole, email?: string | null): string {
  if (isSuperDispatcherEmail(email)) return "Super Dispatcher";
  switch (role) {
    case "super_dispatcher":
      return "Super Dispatcher";
    case "dispatcher":
      return "Dispatcher";
    case "sub_dispatcher":
      return "Sub Dispatcher";
    default:
      return "Dispatcher";
  }
}

export function inviteRoleLabel(role: "dispatcher" | "sub_dispatcher"): string {
  return role === "dispatcher" ? "Dispatcher" : "Sub Dispatcher";
}

export type InviteTeamRole = "dispatcher" | "sub_dispatcher";

export function isInviteTeamRole(v: string): v is InviteTeamRole {
  return v === "dispatcher" || v === "sub_dispatcher";
}
