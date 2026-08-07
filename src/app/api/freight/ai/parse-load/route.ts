import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { enforceAiRateLimit } from "@/lib/freight/ai-rate-limit";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import {
  formatLoadSummary,
  parseLoadBoardLine,
} from "@/lib/freight/parse-load-board";
import {
  extractUsZips,
  normalizeZipList,
  splitZipsPickupDelivery,
} from "@/lib/freight/zip-utils";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

const schema = z.object({
  raw: z.string().min(3).max(8000),
});

function enrichWithZips(
  fields: Record<string, unknown>,
  raw: string,
): Record<string, string> {
  const fromAiPu = normalizeZipList(fields.pickupZips ?? fields.pickup_zips);
  const fromAiDel = normalizeZipList(fields.deliveryZips ?? fields.delivery_zips);
  const fromText = extractUsZips(
    [
      raw,
      String(fields.loadDetails ?? ""),
      String(fields.notes ?? ""),
      String(fields.states ?? ""),
    ].join(" "),
  );

  let pickupZips = fromAiPu;
  let deliveryZips = fromAiDel;
  if (!pickupZips.length && !deliveryZips.length && fromText.length) {
    const split = splitZipsPickupDelivery(fromText);
    pickupZips = split.pickupZips;
    deliveryZips = split.deliveryZips;
  } else if (!pickupZips.length && fromText.length) {
    pickupZips = [fromText[0]];
    if (!deliveryZips.length && fromText.length > 1) {
      deliveryZips = fromText.slice(1);
    }
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (k === "pickupZips" || k === "deliveryZips" || k === "pickup_zips" || k === "delivery_zips") {
      continue;
    }
    out[k] = v == null ? "" : String(v);
  }
  out.pickupZips = pickupZips.join(", ");
  out.deliveryZips = deliveryZips.join(", ");
  return out;
}

const PARSE_PROMPT = `Parse this freight load board paste into JSON. Return ONLY valid JSON with these keys (use empty string or empty arrays if unknown):
{
  "companyName": "",
  "loadDetails": "origin → destination lane summary (include all multi-stop cities)",
  "pickupDateTime": "",
  "deliveryDateTime": "",
  "miles": "",
  "loadNumber": "",
  "states": "",
  "rcInvoice": "",
  "broker": "",
  "truckTrailer": "",
  "notes": "equipment, weight, rate per mile, any extra details formatted for carriers",
  "pickupZips": ["12345"],
  "deliveryZips": ["67890"]
}

Extract EVERY US ZIP (5-digit) you see. Put pickup/origin stop ZIPs in pickupZips and delivery/destination stop ZIPs in deliveryZips. Multi-stop loads can have multiple entries in each array.
If cities are listed without ZIPs, leave the arrays empty.

Example: "$400 Factoring 193 San Angelo, TX 76901 (126) Lubbock, TX 79401 7/21 SB 275 lbs 26 ft - Full"
→ rate 400, miles 126, San Angelo TX → Lubbock TX, pickupZips ["76901"], deliveryZips ["79401"]`;

export async function POST(req: NextRequest) {
  const rate = await enforceAiRateLimit("parse-load");
  if (rate instanceof NextResponse) return rate;

  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const local = parseLoadBoardLine(body.raw);
  if (local) {
    const fields = enrichWithZips(local as unknown as Record<string, unknown>, body.raw);
    return NextResponse.json({
      fields,
      carrierSummary: formatLoadSummary(local),
      source: "local",
    });
  }

  const groq = getGroqClient();
  if (!groq) {
    return NextResponse.json(
      { error: "Could not parse load — check format or set GROQ_API_KEY for AI parsing" },
      { status: 422 },
    );
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

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const fields = enrichWithZips(parsed, body.raw);
    const summary = [
      fields.rcInvoice ? `Rate: $${fields.rcInvoice}` : null,
      fields.miles ? `${fields.miles} mi` : null,
      fields.loadDetails || null,
      fields.pickupZips ? `PU ZIP ${fields.pickupZips}` : null,
      fields.deliveryZips ? `DEL ZIP ${fields.deliveryZips}` : null,
      fields.notes || null,
    ]
      .filter(Boolean)
      .join(" · ");

    return NextResponse.json({ fields, carrierSummary: summary, source: "ai" });
  } catch (e) {
    console.error("[parse-load]", e);
    return NextResponse.json({ error: "Parse failed" }, { status: 500 });
  }
}
