import { NextRequest, NextResponse } from "next/server";
import { FREIGHT_AI_SYSTEM, getGroqClient, groqModel } from "@/lib/freight/groq-client";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const DOC_PARSE_PROMPT = `You are a freight document parser for Alpha Freight TMS.
Extract load data from this Rate Confirmation (RC), BOL, or POD document.
Return ONLY valid JSON with no markdown:
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

function isPdfFile(file: File): boolean {
  const name = file.name?.toLowerCase() ?? "";
  return (
    file.type === "application/pdf" ||
    file.type === "application/x-pdf" ||
    name.endsWith(".pdf")
  );
}

function isImageFile(file: File): boolean {
  const name = file.name?.toLowerCase() ?? "";
  return (
    file.type.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|bmp|heic)$/i.test(name)
  );
}

function imageMimeForFile(file: File): string {
  if (file.type.startsWith("image/")) return file.type;
  const name = file.name?.toLowerCase() ?? "";
  if (name.endsWith(".png")) return "image/png";
  if (name.endsWith(".webp")) return "image/webp";
  if (name.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    const text = result.text?.replace(/\s+/g, " ").trim() ?? "";
    if (text.length > 40) return text.slice(0, 12000);
  } catch (e) {
    console.warn("[parse-document] pdf-parse failed:", e);
  }

  const raw = buffer.toString("latin1");
  const chunks: string[] = [];
  const re = /\(([^\\)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw)) !== null) {
    const t = m[1].replace(/\\n/g, " ").trim();
    if (t.length > 2 && /[a-zA-Z0-9]/.test(t)) chunks.push(t);
  }
  const joined = chunks.join(" ").replace(/\s+/g, " ").slice(0, 12000);
  return joined.length > 40 ? joined : "";
}

function parseLlmJson(raw: string): Record<string, string> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  const attempts = [
    jsonMatch[0],
    jsonMatch[0].replace(/,\s*([}\]])/g, "$1"),
    jsonMatch[0].replace(/[\u0000-\u001F]+/g, " "),
  ];

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate) as Record<string, string>;
    } catch {
      /* try next */
    }
  }
  return null;
}

async function parseWithGroq(opts: {
  groq: NonNullable<ReturnType<typeof getGroqClient>>;
  buffer: Buffer;
  file: File;
  docHint: string;
}) {
  const { groq, buffer, file, docHint } = opts;

  if (isImageFile(file)) {
    const mime = imageMimeForFile(file);
    const dataUrl = `data:${mime};base64,${buffer.toString("base64")}`;
    return groq.chat.completions.create({
      model: groqVisionModel(),
      messages: [
        { role: "system", content: FREIGHT_AI_SYSTEM },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `${DOC_PARSE_PROMPT}\nDocument hint: ${docHint || "auto-detect"}`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 1200,
    });
  }

  if (isPdfFile(file)) {
    const text = await extractPdfText(buffer);
    if (!text) {
      throw new Error(
        "PDF_TEXT_EMPTY: Could not read PDF text — try uploading a photo or screenshot of the RC/BOL/POD",
      );
    }
    return groq.chat.completions.create({
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
      response_format: { type: "json_object" },
    });
  }

  throw new Error("UNSUPPORTED: Upload PDF or image (JPG/PNG)");
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

  if (!isPdfFile(file) && !isImageFile(file)) {
    return NextResponse.json(
      { error: "Upload a PDF or image (JPG/PNG) of the rate confirmation" },
      { status: 400 },
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  try {
    let completion = await parseWithGroq({ groq, buffer, file, docHint });
    let raw = completion.choices[0]?.message?.content?.trim() ?? "";
    let parsed = parseLlmJson(raw);

    if (!parsed && raw) {
      completion = await groq.chat.completions.create({
        model: groqModel(),
        messages: [
          { role: "system", content: FREIGHT_AI_SYSTEM },
          {
            role: "user",
            content: `Convert this freight document analysis to JSON only:\n${raw}\n\n${DOC_PARSE_PROMPT}`,
          },
        ],
        temperature: 0,
        max_tokens: 1200,
        response_format: { type: "json_object" },
      });
      raw = completion.choices[0]?.message?.content?.trim() ?? "";
      parsed = parseLlmJson(raw);
    }

    if (!parsed) {
      console.warn("[parse-document] no JSON in response:", raw.slice(0, 400));
      return NextResponse.json(
        {
          error:
            "Could not extract load data — try a clearer photo/screenshot or re-upload the RC PDF",
        },
        { status: 422 },
      );
    }

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
    const msg = e instanceof Error ? e.message : "Document parse failed";
    if (msg.startsWith("PDF_TEXT_EMPTY:")) {
      return NextResponse.json({ error: msg.replace("PDF_TEXT_EMPTY: ", "") }, { status: 422 });
    }
    if (msg.startsWith("UNSUPPORTED:")) {
      return NextResponse.json({ error: msg.replace("UNSUPPORTED: ", "") }, { status: 400 });
    }
    console.error("[parse-document]", e);
    return NextResponse.json({ error: "Document parse failed" }, { status: 500 });
  }
}
