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

/** Regular dispatcher sidebar (super gets everything). */
export const DISPATCHER_NAV_PATHS = [
  "/dispatcher/dashboard",
  "/dispatcher/loads",
  "/dispatcher/chat",
  "/dispatcher/carrier-portal",
  "/dispatcher/invoices",
  "/dispatcher/alerts",
  "/dispatcher/drivers",
] as const;

/** Super-only nav (owner / full ops). */
export const SUPER_DISPATCHER_ONLY_NAV_PATHS = [
  "/dispatcher/carriers",
  "/dispatcher/reports",
  "/dispatcher/approvals",
  "/dispatcher/team",
  "/dispatcher/academy",
  "/dispatcher/messages",
  "/dispatcher/ai",
] as const;

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
  return role === "super_dispatcher";
}

export function canManageCarriersRoster(role: TmsRole): boolean {
  return role === "super_dispatcher";
}

export function canManageDrivers(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canAccessCarrierPortal(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canViewAlerts(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

/** Full dashboard with fleet, bookers, aging, etc. Super only. */
export function canViewFullDashboard(role: TmsRole): boolean {
  return role === "super_dispatcher";
}

/** Weekly earnings snapshot on dashboard. */
export function canViewWeeklyDashboard(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function canAccessDispatcherNav(role: TmsRole): boolean {
  return roleRank(role) >= 1;
}

/** Sidebar / route visibility by TMS role (not profiles.role). */
export function canAccessDispatcherNavItem(role: TmsRole, href: string): boolean {
  if (!role) return false;

  const path = href.split("?")[0];

  if (role === "super_dispatcher") return true;

  if (role === "dispatcher") {
    return (DISPATCHER_NAV_PATHS as readonly string[]).includes(path);
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
