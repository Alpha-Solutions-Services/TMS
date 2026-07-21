import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  isSuperDispatcherEmail,
  type TmsRole,
} from "@/lib/tms/roles";

export type { TmsRole } from "@/lib/tms/roles";
export {
  isDispatcherRole,
  isSuperDispatcherEmail,
  roleHomePath,
  tmsDisplayName,
} from "@/lib/tms/roles";

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

export async function isActiveSubDispatcher(user: User | null): Promise<boolean> {
  if (!user?.id || isSuperDispatcherEmail(user.email)) return false;
  const db = getServiceRoleClient();
  if (!db) return false;
  const { data } = await db
    .from("tms_users")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  return data?.role === "sub_dispatcher" && data.active === true;
}

export async function canAccessDispatcherPortal(user: User | null): Promise<boolean> {
  if (!user?.email) return false;
  if (isSuperDispatcherEmail(user.email)) return true;
  return isActiveSubDispatcher(user);
}

export async function requireSuperDispatcher(): Promise<
  { user: User } | { error: NextResponse }
> {
  const user = await getPortalUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") {
    return { error: NextResponse.json({ error: "Super dispatcher only" }, { status: 403 }) };
  }
  return { user };
}

export async function syncSubDispatcherProfile(
  userId: string,
  email: string,
  fullName?: string | null,
): Promise<void> {
  const db = getServiceRoleClient();
  if (!db) return;

  const emailNorm = email.trim().toLowerCase();
  const { data: existing } = await db
    .from("profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();

  if (!existing) {
    await db.from("profiles").insert({
      id: userId,
      email: emailNorm,
      role: "dispatcher",
      full_name: fullName?.trim() || null,
    });
  } else {
    await db
      .from("profiles")
      .update({
        role: "dispatcher",
        full_name: fullName?.trim() || null,
        email: emailNorm,
      })
      .eq("id", userId);
  }

  await db.auth.admin
    .updateUserById(userId, { user_metadata: { role: "dispatcher" } })
    .catch(() => {});
}

export async function revokeSubDispatcherAccess(userId: string): Promise<void> {
  const db = getServiceRoleClient();
  if (!db) return;

  await db
    .from("tms_users")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("role", "sub_dispatcher");

  await db.from("profiles").update({ role: "client" }).eq("id", userId);
  await db.auth.admin
    .updateUserById(userId, { user_metadata: { role: "client" } })
    .catch(() => {});
}
