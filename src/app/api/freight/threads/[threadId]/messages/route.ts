import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logFreightAction } from "@/lib/freight/audit-log";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
  body: z.string().max(4000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        mime: z.string(),
      }),
    )
    .max(5)
    .optional(),
});

async function isThreadMember(db: ReturnType<typeof getServiceRoleClient>, threadId: string, userId: string) {
  if (!db) return false;
  const { data } = await db
    .from("freight_thread_members")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  if (!(await isThreadMember(db, params.threadId, user.id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const { data: messages } = await db
    .from("freight_thread_messages")
    .select("id, sender_id, sender_role, body, attachments, created_at")
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: true });

  const { data: members } = await db
    .from("freight_thread_members")
    .select("user_id, role")
    .eq("thread_id", params.threadId);

  return NextResponse.json({ messages: messages ?? [], members: members ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } },
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  if (!(await isThreadMember(db, params.threadId, user.id))) {
    return NextResponse.json({ error: "Not a member" }, { status: 403 });
  }

  const text = body.body?.trim() ?? "";
  const attachments = body.attachments ?? [];
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
  }

  const { data: msg, error } = await db
    .from("freight_thread_messages")
    .insert({
      thread_id: params.threadId,
      sender_id: user.id,
      sender_role: role ?? "dispatcher",
      body: text || `[${attachments.length} attachment(s)]`,
      attachments,
    })
    .select("id, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: "Could not send message" }, { status: 500 });
  }

  await db
    .from("freight_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.threadId);

  await logFreightAction({
    actorId: user.id,
    actorEmail: user.email,
    action: "message.sent",
    entityType: "freight_thread",
    entityId: params.threadId,
  });

  return NextResponse.json({ ok: true, message: msg });
}
