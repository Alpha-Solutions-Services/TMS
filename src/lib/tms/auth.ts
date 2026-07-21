import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { canInviteCarriersAndDrivers } from "@/lib/tms/permissions";
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

export async function isActiveTmsDispatcher(user: User | null): Promise<boolean> {
  if (!user?.id || isSuperDispatcherEmail(user.email)) return false;
  const db = getServiceRoleClient();
  if (!db) return false;
  const { data } = await db
    .from("tms_users")
    .select("role, active")
    .eq("id", user.id)
    .maybeSingle();
  return (
    (data?.role === "dispatcher" || data?.role === "sub_dispatcher") &&
    data.active === true
  );
}

/** @deprecated use isActiveTmsDispatcher */
export async function isActiveSubDispatcher(user: User | null): Promise<boolean> {
  return isActiveTmsDispatcher(user);
}

export async function canAccessDispatcherPortal(user: User | null): Promise<boolean> {
  if (!user?.email) return false;
  if (isSuperDispatcherEmail(user.email)) return true;
  return isActiveTmsDispatcher(user);
}

export async function requireCanInviteCarriersAndDrivers(): Promise<
  { user: User; role: TmsRole } | { error: NextResponse }
> {
  const user = await getPortalUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const role = await resolveTmsRole(user);
  if (!role || !canInviteCarriersAndDrivers(role)) {
    return {
      error: NextResponse.json(
        { error: "Super dispatcher or dispatcher role required" },
        { status: 403 },
      ),
    };
  }
  return { user, role };
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

export async function syncDispatcherTeamProfile(
  userId: string,
  email: string,
  fullName?: string | null,
): Promise<void> {
  await syncSubDispatcherProfile(userId, email, fullName);
}

export async function revokeTeamMemberAccess(
  userId: string,
  role: "dispatcher" | "sub_dispatcher",
): Promise<void> {
  const db = getServiceRoleClient();
  if (!db) return;

  await db
    .from("tms_users")
    .update({ active: false, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .eq("role", role);

  await db.from("profiles").update({ role: "client" }).eq("id", userId);
  await db.auth.admin
    .updateUserById(userId, { user_metadata: { role: "client" } })
    .catch(() => {});
}

export async function revokeSubDispatcherAccess(userId: string): Promise<void> {
  await revokeTeamMemberAccess(userId, "sub_dispatcher");
}

/** Server-side only — uses service role to upsert tms_users (no client INSERT policy). */
export async function ensureDispatcherTmsUser(params: {
  userId: string;
  email: string;
  superDispatcher: boolean;
}): Promise<{ ok: true; role: string } | { ok: false; error: string }> {
  const db = getServiceRoleClient();
  if (!db) return { ok: false, error: "Database not configured" };

  const emailNorm = params.email.trim().toLowerCase();

  const { data: existing } = await db
    .from("tms_users")
    .select("id, role, active")
    .eq("id", params.userId)
    .maybeSingle();

  if (params.superDispatcher) {
    const { error } = await db.from("tms_users").upsert(
      {
        id: params.userId,
        email: emailNorm,
        role: "super_dispatcher",
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) return { ok: false, error: error.message };
    console.info("[tms_users] Upserted super_dispatcher", {
      userId: params.userId,
      email: emailNorm,
      previousRole: existing?.role ?? null,
    });
    return { ok: true, role: "super_dispatcher" };
  }

  if (!existing?.active) {
    return {
      ok: false,
      error: "No active dispatcher team record. Ask a super dispatcher to invite you.",
    };
  }

  if (existing.role !== "dispatcher" && existing.role !== "sub_dispatcher") {
    return { ok: false, error: "Invalid team role on account." };
  }

  console.info("[tms_users] Verified team member", {
    userId: params.userId,
    email: emailNorm,
    role: existing.role,
  });
  return { ok: true, role: existing.role };
}
