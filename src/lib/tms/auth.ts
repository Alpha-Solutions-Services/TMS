import type { User } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type TmsRole =
  | "super_dispatcher"
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
    "mikran.dispatch@gmail.com,alphaassistant.alpha@gmail.com,muhammadmikran.alpha@gmail.com";
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
  return role === "super_dispatcher" || role === "sub_dispatcher";
}

export function roleHomePath(role: TmsRole): string {
  switch (role) {
    case "super_dispatcher":
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

export async function resolveTmsRole(user: User | null): Promise<TmsRole> {
  if (!user?.email) return null;

  if (isSuperDispatcherEmail(user.email)) return "super_dispatcher";

  const db = getServiceRoleClient();
  if (!db) return null;

  const { data } = await db
    .from("tms_users")
    .select("role, active")
    .eq("id", user.id)
    .eq("active", true)
    .maybeSingle();

  if (!data?.role) return null;
  return data.role as TmsRole;
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
