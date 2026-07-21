import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const schema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
  trainingNotes: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const groq = getGroqClient();
  if (!groq) {
    return NextResponse.json({ error: "AI assistant unavailable" }, { status: 503 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let conversationId = body.conversationId;
  if (!conversationId) {
    const { data, error } = await db
      .from("freight_ai_conversations")
      .insert({
        user_id: user.id,
        title: body.message.slice(0, 60),
        training_notes: body.trainingNotes?.trim() || null,
      })
      .select("id, training_notes")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
    }
    conversationId = data.id as string;
  }

  const { data: conv } = await db
    .from("freight_ai_conversations")
    .select("id, training_notes")
    .eq("id", conversationId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!conv) return NextResponse.json({ error: "Conversation not found" }, { status: 404 });

  if (body.trainingNotes !== undefined) {
    await db
      .from("freight_ai_conversations")
      .update({ training_notes: body.trainingNotes.trim() || null })
      .eq("id", conversationId);
  }

  await db.from("freight_ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: body.message,
  });

  const { data: history } = await db
    .from("freight_ai_messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(20);

  const training = body.trainingNotes?.trim() || (conv.training_notes as string | null) || "";
  const system = training
    ? `${FREIGHT_AI_SYSTEM}\n\nTraining notes from super dispatcher:\n${training}`
    : FREIGHT_AI_SYSTEM;

  const completion = await groq.chat.completions.create({
    model: groqModel(),
    messages: [
      { role: "system", content: system },
      ...(history ?? []).map((m) => ({
        role: m.role as "user" | "assistant" | "system",
        content: String(m.content),
      })),
    ],
    temperature: 0.4,
    max_tokens: 900,
  });

  const reply =
    completion.choices[0]?.message?.content?.trim() ||
    "Sorry — I could not generate a reply.";

  await db.from("freight_ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
  });

  await db
    .from("freight_ai_conversations")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", conversationId);

  return NextResponse.json({ conversationId, reply });
}
