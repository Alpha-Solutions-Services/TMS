import { getGroqClient, groqModel, FREIGHT_AI_SYSTEM } from "@/lib/freight/groq-client";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type ExtractionDocType = "pod" | "bol" | "rc" | "other";

const EXTRACT_PROMPT = `You are a freight document OCR helper for Alpha Freight TMS.
Extract key fields from this POD, BOL, or RC. Return ONLY valid JSON:
{
  "delivery_date": "",
  "consignee": "",
  "seal": "",
  "load_number": "",
  "raw_text": "short summary of what you see (max 400 chars)"
}`;

function mapLoadDocType(type: string): ExtractionDocType {
  if (type === "pod") return "pod";
  if (type === "bol") return "bol";
  if (type === "rate_con") return "rc";
  return "other";
}

function parseJson(raw: string): Record<string, string> | null {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const m = cleaned.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0].replace(/,\s*([}\]])/g, "$1")) as Record<string, string>;
  } catch {
    return null;
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  try {
    const pdfParse = (await import("pdf-parse")).default;
    const result = await pdfParse(buffer);
    return (result.text ?? "").replace(/\s+/g, " ").trim().slice(0, 10000);
  } catch {
    return "";
  }
}

/**
 * Best-effort Groq OCR after load document upload. Never throws to callers —
 * failures are logged and skipped so uploads still succeed.
 */
export async function extractAndPersistLoadDocument(params: {
  loadId: string;
  storagePath: string;
  loadDocType: string;
  buffer: Buffer;
  contentType: string;
  filename: string;
  carrierProfileId?: string | null;
  createdBy?: string | null;
}): Promise<{ ok: true; id: string } | { ok: false; skipped: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false, skipped: "no_db" };

  const groq = getGroqClient();
  if (!groq) return { ok: false, skipped: "no_groq" };

  const documentType = mapLoadDocType(params.loadDocType);
  if (documentType === "other" && params.loadDocType !== "commodity") {
    return { ok: false, skipped: "unsupported_type" };
  }

  const isImage = params.contentType.startsWith("image/");
  const isPdf =
    params.contentType.includes("pdf") ||
    params.filename.toLowerCase().endsWith(".pdf");

  let model = groqModel();
  let raw = "";

  try {
    if (isImage) {
      model = process.env.GROQ_VISION_MODEL?.trim() || "llama-3.2-11b-vision-preview";
      const dataUrl = `data:${params.contentType};base64,${params.buffer.toString("base64")}`;
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: FREIGHT_AI_SYSTEM },
          {
            role: "user",
            content: [
              { type: "text", text: `${EXTRACT_PROMPT}\nHint: ${documentType}` },
              { type: "image_url", image_url: { url: dataUrl } },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
      });
      raw = completion.choices[0]?.message?.content?.trim() ?? "";
    } else if (isPdf) {
      const text = await extractPdfText(params.buffer);
      if (text.length < 40) return { ok: false, skipped: "pdf_text_empty" };
      const completion = await groq.chat.completions.create({
        model,
        messages: [
          { role: "system", content: FREIGHT_AI_SYSTEM },
          {
            role: "user",
            content: `${EXTRACT_PROMPT}\nHint: ${documentType}\n\nPDF text:\n${text}`,
          },
        ],
        temperature: 0.1,
        max_tokens: 800,
        response_format: { type: "json_object" },
      });
      raw = completion.choices[0]?.message?.content?.trim() ?? "";
    } else {
      return { ok: false, skipped: "unsupported_mime" };
    }
  } catch (e) {
    console.warn("[document-extractions] groq failed", e);
    return { ok: false, skipped: "groq_error" };
  }

  const parsed = parseJson(raw) ?? {
    raw_text: raw.slice(0, 400) || "unparsed",
  };

  const extracted = {
    delivery_date: parsed.delivery_date ?? "",
    consignee: parsed.consignee ?? "",
    seal: parsed.seal ?? "",
    load_number: parsed.load_number ?? "",
    raw_text: (parsed.raw_text ?? "").slice(0, 500),
  };

  const { data, error } = await admin
    .from("tms_document_extractions")
    .insert({
      load_id: params.loadId,
      carrier_profile_id: params.carrierProfileId ?? null,
      document_type: documentType === "other" ? "other" : documentType,
      storage_path: params.storagePath,
      extracted,
      model,
      created_by: params.createdBy ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.warn("[document-extractions] insert failed", error?.message);
    return { ok: false, skipped: "insert_failed" };
  }

  return { ok: true, id: data.id as string };
}
