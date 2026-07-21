import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logFreightAction } from "@/lib/freight/audit-log";
import type { ChatAttachment } from "@/lib/freight/chat-types";
import { PUBLIC_SITE_URL } from "@/lib/freight/constants";
import { sendLoadChatMessageEmail } from "@/lib/freight/emails";
import {
  ensureLoadChatThread,
  resolveLoadChatNotifyEmails,
  syncLoadChatMembers,
} from "@/lib/freight/load-chat-thread";
import { resolveProfileName } from "@/lib/freight/load-documents";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
  body: z.string().max(4000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        mime: z.string(),
        docType: z.string().optional(),
      }),
    )
    .max(5)
    .optional(),
});

async function isThreadMember(
  db: NonNullable<ReturnType<typeof getServiceRoleClient>>,
  threadId: string,
  userId: string,
) {
  const { data } = await db
    .from("freight_thread_members")
    .select("user_id")
    .eq("thread_id", threadId)
    .eq("user_id", userId)
    .maybeSingle();
  return Boolean(data);
}

async function resolveSenderRole(userId: string): Promise<string> {
  const user = await getPortalUser();
  if (!user) return "user";
  const role = await resolveTmsRole(user);
  if (role) return role;
  const db = getServiceRoleClient();
  if (!db) return "user";
  const { data: profile } = await db
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return (profile?.role as string) || "user";
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { loadId: string } },
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let threadId: string | null = null;
  const { data: thread } = await db
    .from("freight_threads")
    .select("id")
    .eq("load_id", params.loadId)
    .eq("thread_type", "load")
    .maybeSingle();

  if (thread?.id) {
    threadId = thread.id;
  } else {
    threadId = await ensureLoadChatThread(params.loadId, user.id);
  }

  if (!threadId) {
    return NextResponse.json({ error: "Load chat not found" }, { status: 404 });
  }

  if (!(await isThreadMember(db, threadId, user.id))) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const { data: messages } = await db
    .from("freight_thread_messages")
    .select("id, sender_id, sender_role, body, attachments, created_at")
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  return NextResponse.json({ threadId, messages: messages ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { loadId: string } },
) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof postSchema>;
  try {
    body = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const text = body.body?.trim() ?? "";
  const attachments = (body.attachments ?? []) as ChatAttachment[];
  if (!text && attachments.length === 0) {
    return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let threadId: string | null = null;
  const { data: thread } = await db
    .from("freight_threads")
    .select("id")
    .eq("load_id", params.loadId)
    .eq("thread_type", "load")
    .maybeSingle();

  threadId = thread?.id ?? (await ensureLoadChatThread(params.loadId, user.id));
  if (!threadId) {
    return NextResponse.json({ error: "Could not open chat" }, { status: 500 });
  }

  await syncLoadChatMembers(params.loadId);

  if (!(await isThreadMember(db, threadId, user.id))) {
    // Auto-add sender if they are dispatch/carrier/driver on this load
    await db.from("freight_thread_members").upsert(
      { thread_id: threadId, user_id: user.id, role: "member" },
      { onConflict: "thread_id,user_id" },
    );
    if (!(await isThreadMember(db, threadId, user.id))) {
      return NextResponse.json({ error: "Not a participant" }, { status: 403 });
    }
  }

  const senderRole = await resolveSenderRole(user.id);
  const messageBody = text || `[${attachments.length} attachment(s)]`;

  const { data: msg, error } = await db
    .from("freight_thread_messages")
    .insert({
      thread_id: threadId,
      sender_id: user.id,
      sender_role: senderRole,
      body: messageBody,
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
    .eq("id", threadId);

  await logFreightAction({
    actorId: user.id,
    actorEmail: user.email,
    action: "message.sent",
    entityType: "load_thread",
    entityId: params.loadId,
    meta: { attachments: attachments.length },
  });

  // Email carrier + driver (skip the sender's own inbox when possible)
  try {
    const notify = await resolveLoadChatNotifyEmails(params.loadId);
    const senderName =
      (await resolveProfileName(user.id)) || user.email || "Team member";
    const senderEmail = user.email?.trim().toLowerCase() ?? "";
    const roleLabel =
      senderRole === "driver"
        ? "driver"
        : senderRole === "carrier"
          ? "carrier"
          : "dispatch";

    const recipients: { to: string; name: string; url: string; label: string }[] = [];
    if (notify.carrierEmail && notify.carrierEmail.toLowerCase() !== senderEmail) {
      recipients.push({
        to: notify.carrierEmail,
        name: "Carrier",
        url: `${PUBLIC_SITE_URL}/carrier/chat`,
        label: "Open carrier chat",
      });
    }
    if (notify.driverEmail && notify.driverEmail.toLowerCase() !== senderEmail) {
      recipients.push({
        to: notify.driverEmail,
        name: "Driver",
        url: `${PUBLIC_SITE_URL}/driver/chat?load=${encodeURIComponent(params.loadId)}`,
        label: "Open load chat",
      });
    }

    await Promise.all(
      recipients.map((r) =>
        sendLoadChatMessageEmail({
          to: r.to,
          recipientName: r.name,
          loadNumber: notify.loadNumber,
          senderName,
          senderRole: roleLabel,
          messagePreview: messageBody,
          portalUrl: r.url,
          portalLabel: r.label,
        }).catch(() => {}),
      ),
    );
  } catch (e) {
    console.error("[load-chat] notify email failed", e);
  }

  return NextResponse.json({ ok: true, message: msg, threadId });
}
