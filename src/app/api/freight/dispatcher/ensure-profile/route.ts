import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canAccessDispatcherPortal,
  ensureDispatcherTmsUser,
  isActiveTmsDispatcher,
  isSuperDispatcherEmail,
  syncSubDispatcherProfile,
} from "@/lib/tms/auth";
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
  const superDispatcher = isSuperDispatcherEmail(emailNorm);
  const activeTeam = await isActiveTmsDispatcher(user);

  if (!superDispatcher && !activeTeam) {
    console.warn("[ensure-profile] Access denied — no team row", {
      userId: user.id,
      email: emailNorm,
    });
    return NextResponse.json(
      { error: "Dispatcher access requires a super dispatcher invitation." },
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

    if (superDispatcher) {
      const { data: existing } = await admin
        .from("profiles")
        .select("id, role")
        .eq("id", user.id)
        .maybeSingle();

      if (!existing) {
        const { error } = await admin.from("profiles").insert({
          id: user.id,
          email: emailNorm,
          role: "dispatcher",
        });
        if (error) {
          console.error("[ensure-profile] profiles insert failed", {
            userId: user.id,
            message: error.message,
          });
          return NextResponse.json(
            { error: "Unable to create dispatcher profile. Try again or contact support." },
            { status: 500 },
          );
        }
        console.info("[ensure-profile] Created profiles row for super dispatcher", {
          userId: user.id,
          email: emailNorm,
        });
      } else if (existing.role !== "dispatcher") {
        const { error } = await admin
          .from("profiles")
          .update({ role: "dispatcher", email: emailNorm })
          .eq("id", user.id);
        if (error) {
          console.error("[ensure-profile] profiles role update failed", {
            userId: user.id,
            message: error.message,
          });
          return NextResponse.json(
            { error: "Unable to set dispatcher profile role." },
            { status: 500 },
          );
        }
        console.info("[ensure-profile] Updated profiles role for super dispatcher", {
          userId: user.id,
          email: emailNorm,
        });
      }
    } else {
      await syncSubDispatcherProfile(user.id, emailNorm);
      console.info("[ensure-profile] Synced team dispatcher profile", {
        userId: user.id,
        email: emailNorm,
        role: tmsResult.role,
      });
    }

    await admin.auth.admin
      .updateUserById(user.id, { user_metadata: { role: "dispatcher" } })
      .catch((err: unknown) => {
        console.warn("[ensure-profile] auth metadata update skipped", {
          userId: user.id,
          message: err instanceof Error ? err.message : String(err),
        });
      });

    return NextResponse.json({ ok: true, role: tmsResult.role });
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
