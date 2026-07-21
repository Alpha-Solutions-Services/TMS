import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  canAccessDispatcherPortal,
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
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
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
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const superDispatcher = isSuperDispatcherEmail(user.email);
  const activeTeam = await isActiveTmsDispatcher(user);

  if (!superDispatcher && !activeTeam) {
    return NextResponse.json(
      { error: "Dispatcher access requires a super dispatcher invitation." },
      { status: 403 },
    );
  }

  if (!(await canAccessDispatcherPortal(user))) {
    return NextResponse.json({ error: "Dispatcher access has been terminated." }, { status: 403 });
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
        email: user.email.toLowerCase(),
        role: "dispatcher",
      });
      if (error) {
        return NextResponse.json({ error: "Unable to provision dispatcher profile" }, { status: 500 });
      }
    } else if (existing.role !== "dispatcher") {
      const { error } = await admin.from("profiles").update({ role: "dispatcher" }).eq("id", user.id);
      if (error) {
        return NextResponse.json({ error: "Unable to set dispatcher role" }, { status: 500 });
      }
    }
  } else {
    await syncSubDispatcherProfile(user.id, user.email);
  }

  await admin.auth.admin
    .updateUserById(user.id, { user_metadata: { role: "dispatcher" } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}
