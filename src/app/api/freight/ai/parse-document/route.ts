import { NextRequest, NextResponse } from "next/server";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOC_PARSE_PROMPT = `You are a freight document parser for Alpha Freight TMS.
Extract load data from this Rate Confirmation (RC), BOL, or POD document.
Return ONLY valid JSON:
{
  "documentType": "rate_con" | "bol" | "pod" | "other",
  "companyName": "",
  "loadDetails": "origin → destination",
  "pickupDateTime": "",
  "deliveryDateTime": "",
  "miles": "",
  "loadNumber": "",
  "states": "",
  "rcInvoice": "",
  "broker": "",
  "truckTrailer": "",
  "notes": "weight, equipment, special instructions"
}`;

function groqVisionModel(): string {
  return process.env.GROQ_VISION_MODEL?.trim() || "llama-3.2-11b-vision-preview";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\(([^\\)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const t = m[1].replace(/\\n/g, " ").trim();
    if (t.length > 2 && /[a-zA-Z0-9]/.test(t)) chunks.push(t);
  }
  const joined = chunks.join(" ").replace(/\s+/g, " ").slice(0, 12000);
  return joined.length > 80 ? joined : "";
}

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  const db = await import("@/lib/supabase/server").then((m) => m.createClient());
  const { data: profile } = db
    ? await db.from("profiles").select("role").eq("id", user.id).maybeSingle()
    : { data: null };

  const isDriver = profile?.role === "driver";
  if (!isDispatcherRole(role) && !isDriver) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const groq = getGroqClient();
  if (!groq) {
    return NextResponse.json({ error: "AI unavailable (GROQ_API_KEY missing)" }, { status: 503 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const docHint = String(form.get("docType") ?? "");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  let completion;

  try {
    if (file.type.startsWith("image/")) {
      const base64 = buffer.toString("base64");
      const dataUrl = `data:${file.type};base64,${base64}`;
      completion = await groq.chat.completions.create({
        model: groqVisionModel(),
        messages: [
          { role: "system", content: FREIGHT_AI_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: `${DOC_PARSE_PROMPT}\nDocument hint: ${docHint || "auto-detect"}` },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      });
    } else if (file.type === "application/pdf") {
      const text = await extractPdfText(buffer);
      if (!text) {
        return NextResponse.json(
          { error: "Could not read PDF text — try uploading a photo or screenshot of the RC/BOL/POD" },
          { status: 422 },
        );
      }
      completion = await groq.chat.completions.create({
        model: groqModel(),
        messages: [
          { role: "system", content: FREIGHT_AI_SYSTEM },
          {
            role: "user",
            content: `${DOC_PARSE_PROMPT}\nDocument hint: ${docHint || "auto-detect"}\n\nExtracted PDF text:\n${text}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 1200,
      });
    } else {
      return NextResponse.json({ error: "Upload PDF or image" }, { status: 400 });
    }

    const raw = completion.choices[0]?.message?.content?.trim() ?? "";
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return NextResponse.json({ error: "Could not extract load data" }, { status: 422 });
    }

    const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
    const summary = [
      parsed.documentType ? `Doc: ${parsed.documentType}` : null,
      parsed.loadNumber ? `Load #${parsed.loadNumber}` : null,
      parsed.rcInvoice ? `Rate $${parsed.rcInvoice}` : null,
      parsed.loadDetails || null,
    ]
      .filter(Boolean)
      .join(" · ");

    return NextResponse.json({
      fields: parsed,
      carrierSummary: summary,
      documentType: parsed.documentType ?? docHint ?? "other",
    });
  } catch (e) {
    console.error("[parse-document]", e);
    return NextResponse.json({ error: "Document parse failed" }, { status: 500 });
  }
}
