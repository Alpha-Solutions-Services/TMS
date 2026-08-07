import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/freight/api-security";
import { runComplianceReminders } from "@/lib/freight/compliance-reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron: email carriers with insurance / IFTA / registration due soon. */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await runComplianceReminders({ warnDays: 30, limit: 80 });
  return NextResponse.json({
    ok: result.errors.length === 0,
    checkedAt: new Date().toISOString(),
    ...result,
  });
}
