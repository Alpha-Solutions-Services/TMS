import { NextRequest, NextResponse } from "next/server";
import { fetchSubDispatcherStats } from "@/lib/freight/sub-dispatcher-stats";
import { requireSuperDispatcher } from "@/lib/tms/auth";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const tab = req.nextUrl.searchParams.get("tab") ?? undefined;
  const stats = await fetchSubDispatcherStats(tab);
  return NextResponse.json({ stats });
}
