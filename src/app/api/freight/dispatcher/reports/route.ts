import { NextResponse } from "next/server";
import { buildDispatcherReports } from "@/lib/freight/dispatch-reports";
import { requireSuperDispatcher } from "@/lib/tms/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  try {
    const reports = await buildDispatcherReports();
    return NextResponse.json(reports);
  } catch (e) {
    console.error("[dispatcher/reports]", e);
    return NextResponse.json({ error: "Could not build reports" }, { status: 500 });
  }
}
