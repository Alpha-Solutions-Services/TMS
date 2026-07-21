import type { User } from "@supabase/supabase-js";

export type TmsRole =
  | "super_dispatcher"
  | "dispatcher"
  | "sub_dispatcher"
  | "carrier"
  | "driver"
  | null;

function normalize(email: string) {
  return email.trim().toLowerCase();
}

function getSuperDispatcherAllowlist(): string[] {
  const raw =
    process.env.SUPER_DISPATCHER_EMAILS?.trim() ||
    process.env.SUPER_ADMIN_EMAILS?.trim() ||
    "";
  if (!raw) {
    console.warn(
      "[tms/roles] SUPER_DISPATCHER_EMAILS is not set — no env-based super dispatchers.",
    );
    return [];
  }
  return raw
    .split(",")
    .map((s) => normalize(s))
    .filter(Boolean);
}

export function isSuperDispatcherEmail(email: string | undefined | null): boolean {
  if (!email) return false;
  return new Set(getSuperDispatcherAllowlist()).has(normalize(email));
}

export function isDispatcherRole(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher" || role === "sub_dispatcher";
}

export function isFullDispatcherRole(role: TmsRole): boolean {
  return role === "super_dispatcher" || role === "dispatcher";
}

export function roleHomePath(role: TmsRole): string {
  switch (role) {
    case "super_dispatcher":
    case "dispatcher":
    case "sub_dispatcher":
      return "/dispatcher";
    case "carrier":
      return "/carrier";
    case "driver":
      return "/driver";
    default:
      return "/login";
  }
}

export function tmsDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, string> | undefined;
  return (
    meta?.full_name ||
    meta?.name ||
    user.email?.split("@")[0] ||
    "User"
  );
}
