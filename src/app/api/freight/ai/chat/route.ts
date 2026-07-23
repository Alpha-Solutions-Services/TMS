import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceAiRateLimit } from "@/lib/freight/ai-rate-limit";
import { buildTmsAiContext } from "@/lib/freight/ai-tms-context";
import {
  extractLoadBoardLine,
  formatCarrierReadyPost,
  wantsLoadFormatting,
} from "@/lib/freight/format-carrier-load";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import { parseLoadBoardLine } from "@/lib/freight/parse-load-board";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
const schema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional().nullable(),
  trainingNotes: z.string().max(2000).optional(),
  chatContext: z.string().max(8000).optional(),
  includeTmsData: z.boolean().optional(),
  loadId: z.string().uuid().optional(),
  carrierProfileId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const rate = await enforceAiRateLimit("chat");
  if (rate instanceof NextResponse) return rate;

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

  let conversationId = body.conversationId ?? undefined;
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

  const loadSource =
    extractLoadBoardLine(body.message) ||
    (body.chatContext ? extractLoadBoardLine(body.chatContext) : null);
  const parsedLoad = loadSource ? parseLoadBoardLine(loadSource) : null;
  const formatRequest = wantsLoadFormatting(body.message);

  if (parsedLoad && (formatRequest || extractLoadBoardLine(body.message))) {
    const formatted = formatCarrierReadyPost(parsedLoad);
    const reply = formatRequest
      ? `Carrier-ready post (copy into chat):\n\n${formatted}`
      : formatted;

    await db.from("freight_ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: body.message,
    });
    await db.from("freight_ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: reply,
    });
    await db
      .from("freight_ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    return NextResponse.json({ conversationId, reply, parsed: true });
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
  let system = training
    ? `${FREIGHT_AI_SYSTEM}\n\nTraining notes from super dispatcher:\n${training}`
    : FREIGHT_AI_SYSTEM;

  if (body.chatContext?.trim()) {
    system += `\n\nActive chat thread (use this to answer questions about the conversation):\n${body.chatContext.trim()}`;
  }

  if (body.includeTmsData !== false) {
    const tms = await buildTmsAiContext({
      userId: user.id,
      loadId: body.loadId,
      carrierProfileId: body.carrierProfileId,
    });
    if (tms) {
      system += `\n\n${tms}\nUse TMS data above when answering. Do not invent loads or rates not listed.`;
    }
  }

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
