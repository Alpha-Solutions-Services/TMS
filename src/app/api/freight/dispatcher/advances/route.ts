import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  decideAdvanceRequest,
  listAllAdvances,
} from "@/lib/freight/advance-requests";
import { createClient } from "@/lib/supabase/server";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-advances", 40)) {
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
  const status = req.nextUrl.searchParams.get("status") || undefined;
  return NextResponse.json({ advances: await listAllAdvances(status || undefined) });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "denied", "paid"]),
  dispatcherNote: z.string().max(1000).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;
  try {
    const body = patchSchema.parse(await req.json());
    const result = await decideAdvanceRequest({
      id: body.id,
      status: body.status,
      dispatcherNote: body.dispatcherNote
        ? sanitizeText(body.dispatcherNote, 1000)
        : undefined,
      decidedBy: auth.user.id,
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
