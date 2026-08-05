import { NextRequest, NextResponse } from "next/server";
import { verifyCronSecret } from "@/lib/freight/api-security";
import { purgeExpiredRejectedCarrierDocuments } from "@/lib/freight/carrier-documents";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Vercel Cron: soft-purge rejected carrier document files after 7 days. */
export async function GET(req: NextRequest) {
  if (!verifyCronSecret(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await purgeExpiredRejectedCarrierDocuments(50);
  return NextResponse.json({
    ok: result.errors.length === 0,
    checkedAt: new Date().toISOString(),
    ...result,
  });
}
