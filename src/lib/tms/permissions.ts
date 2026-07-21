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

export function canBookLoads(role: TmsRole): boolean {
  return roleRank(role) >= 1;
}

/** Sub-dispatcher load creates/edits/deletes need super approval first. */
export function requiresSuperApproval(role: TmsRole): boolean {
  return role === "sub_dispatcher";
}

export function canSendInvoices(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canChatWithCarriers(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canInviteCarriersAndDrivers(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canViewReports(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canManageDrivers(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canAccessCarrierPortal(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canAccessDispatcherNav(role: TmsRole): boolean {
  return roleRank(role) >= 1;
}

/** Sidebar / route visibility by TMS role (not profiles.role). */
export function canAccessDispatcherNavItem(role: TmsRole, href: string): boolean {
  if (!role) return false;
  if (role === "super_dispatcher") return true;

  const path = href.split("?")[0];

  if (role === "dispatcher") {
    return path !== "/dispatcher/team" && path !== "/dispatcher/approvals";
  }

  if (role === "sub_dispatcher") {
    return path === "/dispatcher/loads";
  }

  return false;
}

/** Where to send the user after login or when blocking a forbidden page. */
export function dispatcherLandingPath(role: TmsRole): string {
  if (role === "sub_dispatcher") return "/dispatcher/loads";
  if (role === "super_dispatcher" || role === "dispatcher") return "/dispatcher/dashboard";
  return "/login";
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
