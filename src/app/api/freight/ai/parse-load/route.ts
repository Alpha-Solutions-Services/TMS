import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

const schema = z.object({
  raw: z.string().min(5).max(8000),
});

const PARSE_PROMPT = `Parse this freight load board paste into JSON. Return ONLY valid JSON with these keys (use empty string if unknown):
{
  "companyName": "",
  "loadDetails": "origin → destination lane summary",
  "pickupDateTime": "",
  "deliveryDateTime": "",
  "miles": "",
  "loadNumber": "",
  "states": "",
  "rcInvoice": "",
  "broker": "",
  "truckTrailer": "",
  "notes": "equipment, weight, rate per mile, any extra details formatted for carriers"
}

Example input: "$1,300 $1.04*/mi 1245 Minneapolis, MN (0) Odessa, TX 7/20 SB 165 lbs 16 ft - Full"
Example notes should include: Rate $1,300 · $1.04/mi · 1,245 mi · SB · 165 lbs · 16 ft Full`;

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const groq = getGroqClient();
  if (!groq) {
    return NextResponse.json({ error: "AI parser unavailable (GROQ_API_KEY missing)" }, { status: 503 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  try {
    const completion = await groq.chat.completions.create({
      model: groqModel(),
      messages: [
        { role: "system", content: FREIGHT_AI_SYSTEM },
        { role: "user", content: `${PARSE_PROMPT}\n\nPaste:\n${body.raw}` },
      ],
      temperature: 0.1,
      max_tokens: 900,
    });

    const text = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not parse load data" }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
    const summary = [
      parsed.rcInvoice ? `Rate: $${parsed.rcInvoice}` : null,
      parsed.miles ? `${parsed.miles} mi` : null,
      parsed.loadDetails || null,
      parsed.notes || null,
    ]
      .filter(Boolean)
      .join(" · ");

    return NextResponse.json({ fields: parsed, carrierSummary: summary });
  } catch (e) {
    console.error("[parse-load]", e);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
