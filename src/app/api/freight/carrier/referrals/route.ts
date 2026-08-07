import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import { createReferral, listReferralsForCarrier } from "@/lib/freight/referrals";
import { requireCarrierSession } from "@/lib/freight/require-carrier";
import { PUBLIC_SITE_URL } from "@/lib/freight/constants";

export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-referrals-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;

  const referrals = await listReferralsForCarrier(auth.user.id);
  return NextResponse.json({
    referrals: referrals.map((r) => ({
      ...r,
      shareUrl: `${PUBLIC_SITE_URL}/login?ref=${encodeURIComponent(r.code)}`,
    })),
  });
}

const postSchema = z.object({
  inviteeEmail: z.string().email().optional(),
});

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-referrals-post", 12)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json().catch(() => ({})));
    const created = await createReferral({
      referrerProfileId: auth.user.id,
      inviteeEmail: body.inviteeEmail
        ? sanitizeText(body.inviteeEmail, 200)
        : undefined,
    });
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      referral: {
        ...created.row,
        shareUrl: `${PUBLIC_SITE_URL}/login?ref=${encodeURIComponent(created.row.code)}`,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid email" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
