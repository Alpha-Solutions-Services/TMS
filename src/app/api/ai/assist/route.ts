import Groq from "groq-sdk";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const schema = z.object({
  action: z.enum(["draft", "summarize", "next"]),
  threadId: z.string().uuid().optional(),
  inquiryId: z.string().uuid().optional(),
});

function getGroq() {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return new Groq({ apiKey: key });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const groq = getGroq();
  if (!groq) {
    return NextResponse.json(
      { error: "Assistant drafting is temporarily unavailable." },
      { status: 503 }
    );
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) {
    return NextResponse.json({ error: "DB not configured" }, { status: 503 });
  }

  let context = "";
  if (parsed.threadId) {
    const { data: msgs } = await db
      .from("dm_messages")
      .select("is_admin, body, created_at, deleted_at")
      .eq("thread_id", parsed.threadId)
      .order("created_at", { ascending: true })
      .limit(40);
    context =
      (msgs ?? [])
        .filter((m) => !m.deleted_at)
        .map(
          (m) =>
            `${m.is_admin ? "Admin" : "Client"}: ${m.body || "[attachment]"}`
        )
        .join("\n") || "(empty thread)";
  } else if (parsed.inquiryId) {
    const { data: inq } = await db
      .from("contact_inquiries")
      .select("*")
      .eq("id", parsed.inquiryId)
      .maybeSingle();
    if (inq) {
      context = `Inquiry from ${inq.name} <${inq.email}>\nService: ${inq.service_slug}\nBudget: ${inq.budget || "n/a"}\nMessage: ${inq.message}`;
    }
  }

  const isInquiryEmail =
    Boolean(parsed.inquiryId) && parsed.action === "draft";

  const prompts = {
    draft: isInquiryEmail
      ? `Draft a professional email reply from Alpha Solutions to this inquiry.
Output EXACTLY in this format (no markdown fences):
SUBJECT: <one-line subject>
BODY:
<email body with short paragraphs, sign off as Alpha Solutions team>`
      : "Draft a professional, warm reply the admin can send. Output ONLY the reply text, no preamble.",
    summarize:
      "Summarize this conversation in 3-5 bullet points for the admin. Output only the bullets.",
    next: "Suggest the single best next action for the admin (1-2 sentences). Output only that suggestion.",
  } as const;

  const completion = await groq.chat.completions.create({
    model: process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content:
          "You help Alpha Solutions admins. Never claim you already sent a message. Never invent facts. Do not invent pricing or timelines unless present in context.",
      },
      {
        role: "user",
        content: `${prompts[parsed.action]}\n\nContext:\n${context}`,
      },
    ],
    temperature: 0.4,
    max_tokens: 800,
  });

  const raw = completion.choices[0]?.message?.content?.trim() || "";

  if (isInquiryEmail) {
    const subjectMatch = raw.match(/SUBJECT:\s*(.+?)(?:\n|$)/i);
    const bodyMatch = raw.match(/BODY:\s*([\s\S]*)/i);
    const subject = subjectMatch?.[1]?.trim();
    const text = (bodyMatch?.[1] || raw).trim();
    return NextResponse.json({ text, subject });
  }

  return NextResponse.json({ text: raw });
}
