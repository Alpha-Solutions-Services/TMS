import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher, resolveDispatcherTmsRole } from "@/lib/freight/dispatch-roster";
import {
  deleteFreightMessage,
  editFreightMessage,
} from "@/lib/freight/message-edit";
import { createClient } from "@/lib/supabase/server";
import { canChatWithCarriers } from "@/lib/tms/permissions";
import type { TmsRole } from "@/lib/tms/roles";

const patchSchema = z.object({
  body: z.string().min(1).max(4000),
});

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-message-edit", 40)) {
    return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }
  const sb = await createClient();
  if (!sb) {
    return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };
  }
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  if (!(await assertDispatcher(user))) {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }
  const role = (await resolveDispatcherTmsRole(user)) as TmsRole;
  if (!canChatWithCarriers(role)) {
    return {
      error: NextResponse.json(
        { error: "Sub dispatchers cannot chat with carriers" },
        { status: 403 },
      ),
    };
  }
  return { user };
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = patchSchema.parse(await req.json());
    const result = await editFreightMessage({
      channel: "carrier_dm",
      messageId: params.id,
      userId: auth.user.id,
      body: body.body,
    });
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  const result = await deleteFreightMessage({
    channel: "carrier_dm",
    messageId: params.id,
    userId: auth.user.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
