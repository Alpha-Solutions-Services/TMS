import { NextResponse } from "next/server";
import { buildDispatchDashboard } from "@/lib/freight/build-dispatch-dashboard";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!me || me.role !== "dispatcher") {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab");
    const dashboard = await buildDispatchDashboard(tab);
    return NextResponse.json(dashboard);
  } catch (e) {
    console.error("[dispatcher/dashboard]", e);
    return NextResponse.json(
      { error: "Failed to load dispatch dashboard" },
      { status: 500 },
    );
  }
}
