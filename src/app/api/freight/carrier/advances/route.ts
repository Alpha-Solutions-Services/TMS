import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  createAdvanceRequest,
  listAdvancesForCarrier,
} from "@/lib/freight/advance-requests";
import { requireCarrierSession } from "@/lib/freight/require-carrier";

export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-advances-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;
  return NextResponse.json({
    advances: await listAdvancesForCarrier(auth.user.id),
  });
}

const postSchema = z.object({
  requestType: z.enum(["lumper", "advance"]),
  amount: z.number().positive().max(50000),
  loadId: z.string().uuid().optional().nullable(),
  carrierNote: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-advances-post", 12)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const created = await createAdvanceRequest({
      carrierProfileId: auth.user.id,
      requestType: body.requestType,
      amount: body.amount,
      loadId: body.loadId,
      carrierNote: body.carrierNote
        ? sanitizeText(body.carrierNote, 1000)
        : undefined,
    });
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, advance: created.row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
