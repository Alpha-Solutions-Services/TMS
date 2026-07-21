import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceAiRateLimit } from "@/lib/freight/ai-rate-limit";
import {
  extractLoadBoardLine,
  formatCarrierReadyPost,
} from "@/lib/freight/format-carrier-load";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import { parseLoadBoardLine } from "@/lib/freight/parse-load-board";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { canChatWithCarriers } from "@/lib/tms/permissions";

const schema = z.object({
  text: z.string().min(1).max(4000),
  chatContext: z.string().max(8000).optional(),
});

export async function POST(req: NextRequest) {
  const rate = await enforceAiRateLimit("enhance");
  if (rate instanceof NextResponse) return rate;

  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }
  if (!canChatWithCarriers(role)) {
    return NextResponse.json(
      { error: "Sub dispatchers cannot use carrier chat tools" },
      { status: 403 },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid text" }, { status: 400 });
  }

  const source =
    extractLoadBoardLine(body.text) ||
    (body.chatContext ? extractLoadBoardLine(body.chatContext) : null);
  const parsed = source ? parseLoadBoardLine(source) : null;
  if (parsed) {
    return NextResponse.json({ enhanced: formatCarrierReadyPost(parsed), parsed: true });
  }

  const groq = getGroqClient();
  if (!groq) {
    return NextResponse.json({ error: "AI unavailable" }, { status: 503 });
  }

  const completion = await groq.chat.completions.create({
    model: groqModel(),
    messages: [
      {
        role: "system",
        content: `${FREIGHT_AI_SYSTEM}\nRewrite the dispatcher draft as a short carrier-ready message. Use plain lines (rate, lane, date, equipment). No bullet lists. No "unknown equipment". Output ONLY the message text.`,
      },
      ...(body.chatContext?.trim()
        ? [{ role: "user" as const, content: `Thread context:\n${body.chatContext.trim()}` }]
        : []),
      { role: "user", content: body.text.trim() },
    ],
    temperature: 0.3,
    max_tokens: 500,
  });

  const enhanced =
    completion.choices[0]?.message?.content?.trim() || body.text.trim();
  return NextResponse.json({ enhanced, parsed: false });
}
