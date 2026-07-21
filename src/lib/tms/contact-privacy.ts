import type { TmsRole } from "@/lib/tms/roles";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";

/** Super dispatchers see email/phone; dispatchers and sub dispatchers see names only. */
export function canViewContactDetails(role: TmsRole, email?: string | null): boolean {
  if (isSuperDispatcherEmail(email)) return true;
  return role === "super_dispatcher";
}

export function maskEmail(email: string | null | undefined): string {
  if (!email?.trim()) return "—";
  return "—";
}

export function maskPhone(phone: string | null | undefined): string {
  if (!phone?.trim()) return "—";
  return "—";
}

export function maskCarrierRow<T extends Record<string, unknown>>(
  row: T,
  canViewContacts: boolean,
): T {
  if (canViewContacts) return row;
  return {
    ...row,
    email: null,
    phone: null,
  };
}

export function maskDriverRow<
  T extends { driverEmail?: string; driverPhone?: string; driver_email?: string; driver_phone?: string },
>(row: T, canViewContacts: boolean): T {
  if (canViewContacts) return row;
  return {
    ...row,
    driverEmail: "",
    driverPhone: "",
    driver_email: "",
    driver_phone: "",
  };
}

export function maskCarrierRosterEntry<
  T extends { email?: string; phone?: string; contactName?: string },
>(entry: T, canViewContacts: boolean): T {
  if (canViewContacts) return entry;
  return {
    ...entry,
    email: "",
    phone: "",
  };
}
