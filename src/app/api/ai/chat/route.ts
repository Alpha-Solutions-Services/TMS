import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { emailAiChat } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const schema = z.object({
  message: z.string().min(1).max(4000),
  conversationId: z.string().uuid().optional(),
});

const rateMap = new Map<string, { count: number; reset: number }>();

function rateLimit(userId: string, max = 40) {
  const now = Date.now();
  const row = rateMap.get(userId);
  if (!row || now > row.reset) {
    rateMap.set(userId, { count: 1, reset: now + 60_000 });
    return true;
  }
  if (row.count >= max) return false;
  row.count += 1;
  return true;
}

function getGroq() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return new Groq({ apiKey: key });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!rateLimit(session.user.id)) {
    return NextResponse.json({ error: "Too many messages — try again shortly." }, { status: 429 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const supabase = await createClient();
  const service = getServiceRoleClient();
  if (!supabase) {
    return NextResponse.json({ error: "Auth not configured" }, { status: 503 });
  }

  let conversationId = parsed.conversationId;
  let isNewConversation = false;
  if (!conversationId) {
    const { data, error } = await supabase
      .from("ai_conversations")
      .insert({
        user_id: session.user.id,
        client_email: session.user.email ?? null,
        title: parsed.message.slice(0, 60),
      })
      .select("id, human_joined, training_notes")
      .single();
    if (error || !data) {
      return NextResponse.json({ error: "Could not start chat" }, { status: 500 });
    }
    conversationId = data.id as string;
    isNewConversation = true;
  }

  const { data: conv } = await supabase
    .from("ai_conversations")
    .select("id, human_joined, training_notes, client_email")
    .eq("id", conversationId)
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "user",
    content: parsed.message,
    is_human: false,
  });

  // When a human agent has joined, pause auto-replies and wait for the team.
  if (conv.human_joined) {
    const notice =
      "A team member is in this chat with you. They will reply here shortly — you can keep typing.";
    await supabase.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "assistant",
      content: notice,
      is_human: false,
    });
    await supabase
      .from("ai_conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversationId);

    void emailAiChat({
      clientEmail: session.user.email || (conv.client_email as string),
      userMessage: parsed.message,
      assistantReply: "[Human agent mode — auto-reply paused]",
      conversationId,
      isNewConversation,
    });

    return NextResponse.json({
      conversationId,
      reply: notice,
      humanJoined: true,
    });
  }

  const groq = getGroq();
  if (!groq) {
    return NextResponse.json(
      { error: "Alpha Assistant is temporarily unavailable." },
      { status: 503 }
    );
  }

  // Load CRM project + ticket context + knowledge base
  let projectCtx = "(no projects yet)";
  let knowledgeCtx = "(none yet)";
  if (service) {
    const { data: projects } = await service
      .from("portal_projects")
      .select("title, status, progress, description")
      .eq("client_user_id", session.user.id)
      .limit(8);
    if (projects?.length) {
      projectCtx = projects
        .map(
          (p) =>
            `- ${p.title} (${p.status}, ${p.progress}%): ${(p.description || "").slice(0, 100)}`
        )
        .join("\n");
    }
    const { data: knowledge } = await service
      .from("portal_knowledge")
      .select("question, answer, category")
      .eq("active", true)
      .order("sort_order", { ascending: true })
      .limit(40);
    if (knowledge?.length) {
      knowledgeCtx = knowledge
        .map(
          (k) =>
            `Q [${k.category}]: ${k.question}\nA: ${String(k.answer).slice(0, 600)}`
        )
        .join("\n\n");
    }
  }

  const training = (conv.training_notes as string) || "";
  const { data: history } = await supabase
    .from("ai_messages")
    .select("role, content, is_human")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(30);

  const system = `You are Alpha Assistant, the in-portal support guide for Alpha Solutions Services LLC.
Never mention third-party AI vendors, model names, or that you are powered by an external API.
You help clients clarify requirements, suggest next steps, explain project status, and guide them to create support tickets when needed.
Be warm, concise, and professional. Ask clarifying questions when requirements are vague.
If they need a human, tell them a team member can join this same chat, or they can open a ticket from the Tickets tab.
Prefer answers from the company knowledge base / SOPs below when relevant.
Company: https://www.alphasolutions.software | Portal: https://portal.alphasolutions.software
Contact: info@alphasolutions.software | WhatsApp +923494206922

Client projects:
${projectCtx}

Company knowledge base / SOPs:
${knowledgeCtx}

Internal coaching notes from the Alpha team (follow these carefully):
${training || "(none yet)"}`;

  const messagesForModel = [
    { role: "system" as const, content: system },
    ...((history ?? [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => ({
        role: m.role as "user" | "assistant",
        content: String(m.content),
      })) as { role: "user" | "assistant"; content: string }[]),
  ];

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
    messages: messagesForModel,
    temperature: 0.45,
    max_tokens: 900,
  });

  const reply =
    completion.choices[0]?.message?.content?.trim() ||
    "Sorry — I could not generate a reply. Please open a ticket or message the team.";

  await supabase.from("ai_messages").insert({
    conversation_id: conversationId,
    role: "assistant",
    content: reply,
    is_human: false,
  });

  await supabase
    .from("ai_conversations")
    .update({
      updated_at: new Date().toISOString(),
      client_email: session.user.email ?? conv.client_email,
    })
    .eq("id", conversationId);

  void emailAiChat({
    clientEmail: session.user.email || (conv.client_email as string),
    userMessage: parsed.message,
    assistantReply: reply,
    conversationId,
    isNewConversation,
  });

  return NextResponse.json({
    conversationId,
    reply,
    humanJoined: false,
  });
}
