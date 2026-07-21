import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canAccessDispatcherPortal,
  ensureDispatcherTmsUser,
  resolveTmsRole,
  syncSubDispatcherProfile,
} from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function POST() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const admin = getServiceRoleClient();
  if (!url || !anon || !admin) {
    console.error("[ensure-profile] Server misconfiguration — missing Supabase env");
    return NextResponse.json(
      { error: "Server misconfiguration. Contact support." },
      { status: 500 },
    );
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id || !user.email) {
    return NextResponse.json(
      { error: "Not signed in. Please log in again." },
      { status: 403 },
    );
  }

  const emailNorm = user.email.trim().toLowerCase();
  const tmsRole = await resolveTmsRole(user);
  const superDispatcher = tmsRole === "super_dispatcher";

  if (!tmsRole || !isDispatcherRole(tmsRole)) {
    console.warn("[ensure-profile] Access denied — not dispatch team", {
      userId: user.id,
      email: emailNorm,
      tmsRole,
    });
    return NextResponse.json(
      {
        error:
          "Dispatcher access requires an invitation from a super dispatcher. If you were just invited, accept the email invite and set your password first.",
      },
      { status: 403 },
    );
  }

  if (!(await canAccessDispatcherPortal(user))) {
    return NextResponse.json(
      { error: "Dispatcher access has been terminated." },
      { status: 403 },
    );
  }

  try {
    const tmsResult = await ensureDispatcherTmsUser({
      userId: user.id,
      email: emailNorm,
      superDispatcher,
    });
    if (!tmsResult.ok) {
      console.error("[ensure-profile] tms_users provisioning failed", {
        userId: user.id,
        email: emailNorm,
        error: tmsResult.error,
      });
      return NextResponse.json(
        { error: tmsResult.error ?? "Unable to provision dispatcher account." },
        { status: 500 },
      );
    }

    const profileSync = await syncSubDispatcherProfile(user.id, emailNorm);
    if (!profileSync.ok) {
      console.error("[ensure-profile] profiles sync failed", {
        userId: user.id,
        message: profileSync.error,
      });
      return NextResponse.json(
        { error: "Unable to create dispatcher profile. Try again or contact support." },
        { status: 500 },
      );
    }

    console.info("[ensure-profile] Provisioned dispatcher portal access", {
      userId: user.id,
      email: emailNorm,
      role: tmsResult.role,
    });

    return NextResponse.json({
      ok: true,
      role: tmsResult.role,
      portalRole: "dispatcher",
    });
  } catch (err) {
    console.error("[ensure-profile] Unexpected error", {
      userId: user.id,
      message: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Unexpected error provisioning your account. Please try again." },
      { status: 500 },
    );
  }
}
