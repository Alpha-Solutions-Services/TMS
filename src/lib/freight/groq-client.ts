import Groq from "groq-sdk";

export function getGroqClient(): Groq | null {
  const key = process.env.GROQ_API_KEY?.trim();
  if (!key) return null;
  return new Groq({ apiKey: key });
}

export function groqModel(): string {
  return process.env.GROQ_MODEL?.trim() || "llama-3.3-70b-versatile";
}

export const FREIGHT_AI_SYSTEM = `You are Alpha Freight TMS assistant for dispatchers.
You help format loads for carriers, summarize chat threads, and answer dispatch questions.
Rules:
- When formatting loads, use exact equipment from the text (SB = Step Deck, FB = Flatbed, R = Reefer). Never say "unknown equipment" if SB/FB/R or dimensions are in the message.
- Output carrier-ready posts as short plain lines: Rate, miles, lane, pickup date, equipment, weight/length.
- Never invent load numbers, rates, or payment status not in context.
- Be concise — dispatchers paste your reply directly to carriers.
- Portal URL: tms.alphasolutions.software`;
