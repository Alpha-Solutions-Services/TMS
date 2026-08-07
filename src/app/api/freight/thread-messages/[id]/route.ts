import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import {
  deleteFreightMessage,
  editFreightMessage,
} from "@/lib/freight/message-edit";
import { getPortalUser } from "@/lib/portal/auth";

const patchSchema = z.object({
  body: z.string().min(1).max(4000),
});

async function requireUser(req: NextRequest) {
  if (!checkRateLimit(req, "thread-message-edit", 40)) {
    return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }
  const user = await getPortalUser();
  if (!user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  return { user };
}

/** PATCH/DELETE — edit or soft-delete own load/group thread message (dispatcher, carrier, driver). */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  try {
    const body = patchSchema.parse(await req.json());
    const result = await editFreightMessage({
      channel: "thread",
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
  const auth = await requireUser(req);
  if ("error" in auth) return auth.error;

  const result = await deleteFreightMessage({
    channel: "thread",
    messageId: params.id,
    userId: auth.user.id,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ ok: true });
}
