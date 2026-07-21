import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { isAllowedDispatcherEmail } from "@/lib/dispatcher-allowlist";
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
  if (!user?.id || !isAllowedDispatcherEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data: existing } = await admin
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  if (!existing) {
    const { error } = await admin.from("profiles").insert({
      id: user.id,
      email: (user.email ?? "").toLowerCase(),
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

  await admin.auth.admin
    .updateUserById(user.id, { user_metadata: { role: "dispatcher" } })
    .catch(() => {});

  return NextResponse.json({ ok: true });
}

