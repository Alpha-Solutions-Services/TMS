import { NextResponse } from "next/server";
import { buildDispatcherReports } from "@/lib/freight/dispatch-reports";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
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

  if (!me || (me.role !== "dispatcher" && me.role !== "admin")) {
    return NextResponse.json({ error: "Dispatcher or admin only" }, { status: 403 });
  }

  try {
    const reports = await buildDispatcherReports();
    return NextResponse.json(reports);
  } catch (e) {
    console.error("[dispatcher/reports]", e);
    return NextResponse.json({ error: "Could not build reports" }, { status: 500 });
  }
}
