import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  lookupCarrierByMcDocket,
  normalizeMcNumber,
  summarizeFmcsCarrier,
} from "@/lib/freight/fmcsa";
import { requireSuperDispatcher } from "@/lib/tms/auth";

const schema = z.object({
  mcNumber: z.string().min(1),
});

/** Super dispatcher MC lookup — no email match required (roster onboarding). */
export async function POST(req: NextRequest) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  try {
    const { mcNumber } = schema.parse(await req.json());
    const normalized = normalizeMcNumber(mcNumber);
    if (!normalized) {
      return NextResponse.json({ error: "Invalid MC number" }, { status: 400 });
    }

    const webKey = process.env.FMCSA_API_KEY?.trim();
    if (!webKey) {
      return NextResponse.json({
        fallback: true,
        message: "FMCSA API key not configured — enter carrier details manually.",
      });
    }

    const fmcs = await lookupCarrierByMcDocket(normalized, webKey);
    if (!fmcs.ok) {
      if (fmcs.reason === "not_found") {
        return NextResponse.json({ error: "MC not found in FMCSA database" }, { status: 404 });
      }
      return NextResponse.json({
        fallback: true,
        message: "FMCSA temporarily unavailable — enter details manually.",
      });
    }

    const summary = summarizeFmcsCarrier(fmcs.carrier, auth.user.email ?? "");
    return NextResponse.json({
      ok: true,
      normalizedMc: normalized,
      companyName: summary.companyName,
      mailingAddress: summary.mailingAddress,
      dotNumber: summary.dotNumber ?? "",
      active: summary.active,
      statusSummary: summary.statusSummary,
      fmcsaEmail: summary.fmcsaEmail,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[verify-carrier-mc]", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
