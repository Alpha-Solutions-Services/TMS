import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  listAllReferrals,
  updateReferralStatus,
} from "@/lib/freight/referrals";
import { createClient } from "@/lib/supabase/server";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-referrals", 40)) {
    return {
      error: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    };
  }
  const sb = await createClient();
  if (!sb) {
    return {
      error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }),
    };
  }
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (!isDispatcherRole(await resolveTmsRole(user))) {
    return {
      error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }),
    };
  }
  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  return NextResponse.json({ referrals: await listAllReferrals() });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["pending", "registered", "rewarded", "cancelled"]),
  rewardNote: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  try {
    const body = patchSchema.parse(await req.json());
    const result = await updateReferralStatus({
      id: body.id,
      status: body.status,
      rewardNote: body.rewardNote
        ? sanitizeText(body.rewardNote, 500)
        : undefined,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
