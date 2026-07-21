import type { User } from "@supabase/supabase-js";
import {
  canAccessDispatcherPortal,
  ensureDispatcherTmsUser,
  resolveTmsRole,
  syncDispatcherTeamProfile,
} from "@/lib/tms/auth";
import { dispatcherLandingPath } from "@/lib/tms/permissions";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type ResolvedDestination = {
  path: string;
  role?: string | null;
  status?: string | null;
  error?: string;
};

/**
 * Resolve post-login portal path from the real profile (service role preferred).
 */
export async function resolveLoginDestination(
  user: User,
): Promise<ResolvedDestination> {
  const admin = getServiceRoleClient();
  const emailNorm = user.email?.trim().toLowerCase() ?? "";

  if (emailNorm && isSuperDispatcherEmail(emailNorm) && admin) {
    await ensureDispatcherTmsUser({
      userId: user.id,
      email: emailNorm,
      superDispatcher: true,
    });
    await syncDispatcherTeamProfile(user.id, emailNorm);
  }

  let profile: { role: string | null; carrier_status: string | null } | null = null;
  if (admin) {
    const { data } = await admin
      .from("profiles")
      .select("role, carrier_status")
      .eq("id", user.id)
      .maybeSingle();
    profile = data;
  } else {
    const sb = await createClient();
    if (sb) {
      const { data } = await sb
        .from("profiles")
        .select("role, carrier_status")
        .eq("id", user.id)
        .maybeSingle();
      profile = data;
    }
  }

  const role = profile?.role as string | undefined;
  const status = profile?.carrier_status as string | undefined;

  if (role === "carrier") {
    if (status === "verified") {
      return { path: "/carrier/dashboard", role: "carrier", status };
    }
    if (status === "rejected") {
      return { path: "/carrier/rejected", role: "carrier", status };
    }
    if (status === "suspended") {
      return { path: "/carrier/suspended", role: "carrier", status };
    }
    return {
      path: "/carrier/pending",
      role: "carrier",
      status: status ?? "pending",
    };
  }

  if (role === "driver") {
    return { path: "/driver/dashboard", role: "driver" };
  }

  if (await canAccessDispatcherPortal(user)) {
    const tmsRole = await resolveTmsRole(user);
    if (admin && role !== "dispatcher") {
      await admin.from("profiles").upsert(
        {
          id: user.id,
          email: emailNorm || null,
          role: "dispatcher",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );
    }
    return {
      path: dispatcherLandingPath(tmsRole),
      role: tmsRole ?? "dispatcher",
    };
  }

  if (role === "client" || !role) {
    return { path: "/carrier/register", role: role ?? "client" };
  }

  return {
    path: "/login",
    role: role ?? null,
    error: "No portal access for this account. Ask a super dispatcher for an invite.",
  };
}
