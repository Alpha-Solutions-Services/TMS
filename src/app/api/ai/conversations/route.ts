import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { emailHumanJoined } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const id = req.nextUrl.searchParams.get("id");
  const admin = isAdminUser(session.user);

  if (admin) {
    const db = getServiceRoleClient();
    if (!db) return NextResponse.json({ conversations: [] });
    if (id) {
      const { data: conv } = await db
        .from("ai_conversations")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      const { data: messages } = await db
        .from("ai_messages")
        .select("*")
        .eq("conversation_id", id)
        .order("created_at", { ascending: true });
      return NextResponse.json({ conversation: conv, messages: messages ?? [] });
    }
    const { data } = await db
      .from("ai_conversations")
      .select("id, title, client_email, user_id, human_joined, updated_at, created_at")
      .order("updated_at", { ascending: false })
      .limit(100);
    return NextResponse.json({ conversations: data ?? [] });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ conversations: [] });
  if (id) {
    const { data: conv } = await supabase
      .from("ai_conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", session.user.id)
      .maybeSingle();
    const { data: messages } = await supabase
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at", { ascending: true });
    return NextResponse.json({ conversation: conv, messages: messages ?? [] });
  }
  const { data } = await supabase
    .from("ai_conversations")
    .select("id, title, human_joined, updated_at")
    .eq("user_id", session.user.id)
    .order("updated_at", { ascending: false });
  return NextResponse.json({ conversations: data ?? [] });
}

const joinSchema = z.object({
  conversationId: z.string().uuid(),
  action: z.enum(["join", "leave", "message", "train"]),
  body: z.string().max(8000).optional(),
  trainingNotes: z.string().max(8000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof joinSchema>;
  try {
    parsed = joinSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data: conv } = await db
    .from("ai_conversations")
    .select("*")
    .eq("id", parsed.conversationId)
    .maybeSingle();
  if (!conv) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (parsed.action === "join") {
    await db
      .from("ai_conversations")
      .update({
        human_joined: true,
        human_joined_at: new Date().toISOString(),
        human_admin_id: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.conversationId);

    await db.from("ai_messages").insert({
      conversation_id: parsed.conversationId,
      role: "assistant",
      content: "A team member from Alpha Solutions has joined this chat.",
      is_human: true,
    });

    const email = conv.client_email as string | null;
    if (email) {
      void emailHumanJoined({
        clientEmail: email,
        conversationId: parsed.conversationId,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (parsed.action === "leave") {
    await db
      .from("ai_conversations")
      .update({
        human_joined: false,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.conversationId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.action === "train") {
    const notes = (parsed.trainingNotes || "").trim();
    const prev = (conv.training_notes as string) || "";
    await db
      .from("ai_conversations")
      .update({
        training_notes: prev
          ? `${prev}\n\n---\n${new Date().toISOString()}\n${notes}`
          : notes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.conversationId);
    return NextResponse.json({ ok: true });
  }

  if (parsed.action === "message") {
    const body = (parsed.body || "").trim();
    if (!body) return NextResponse.json({ error: "Empty" }, { status: 400 });
    await db.from("ai_messages").insert({
      conversation_id: parsed.conversationId,
      role: "assistant",
      content: body,
      is_human: true,
    });
    await db
      .from("ai_conversations")
      .update({
        human_joined: true,
        human_admin_id: session.user.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.conversationId);

    const email = conv.client_email as string | null;
    if (email) {
      const { notifyUser, escapeHtml } = await import("@/lib/email/notify");
      const portal = (await import("@/lib/supabase/env")).getPortalUrl();
      void notifyUser({
        email,
        subject: "New message from Alpha Solutions team",
        title: "Team reply",
        html: `<p>A team member replied in your Assistant chat.</p>
          <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${escapeHtml(body.slice(0, 280))}</blockquote>
          <p><a href="${portal}/dashboard?tab=ai" style="color:#38a3ff;">Open chat</a></p>`,
      });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
