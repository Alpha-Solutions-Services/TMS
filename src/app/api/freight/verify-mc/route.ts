import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  lookupCarrierByMcDocket,
  normalizeMcNumber,
  summarizeFmcsCarrier,
} from "@/lib/freight/fmcsa";

// FMCSA API Key: register free at https://mobile.fmcsa.dot.gov/developer/home.page
// Add to .env.local: FMCSA_API_KEY=your_key_here

const schema = z.object({
  mcNumber: z.string().min(1),
  email: z.string().email(),
});

export async function POST(req: NextRequest) {
  try {
    const payload = schema.parse(await req.json());
    const normalized = normalizeMcNumber(payload.mcNumber);
    if (!normalized) {
      return NextResponse.json(
        {
          error:
            "MC number not found in FMCSA database. Please check your number.",
        },
        { status: 400 },
      );
    }

    const webKey = process.env.FMCSA_API_KEY?.trim();
    if (!webKey) {
      return NextResponse.json({
        fallback: true,
        message:
          "FMCSA verification is not configured yet — your application will queue for manual review.",
      });
    }

    const fmcs = await lookupCarrierByMcDocket(normalized, webKey);
    if (!fmcs.ok) {
      if (fmcs.reason === "not_found") {
        return NextResponse.json(
          {
            error:
              "MC number not found in FMCSA database. Please check your number.",
          },
          { status: 404 },
        );
      }
      return NextResponse.json({
        fallback: true,
        message:
          "FMCSA verification is temporarily unavailable — you can proceed and dispatch will validate manually.",
      });
    }

    const summary = summarizeFmcsCarrier(fmcs.carrier, payload.email);
    if (summary.fmcsaEmail && !summary.emailMatched) {
      return NextResponse.json(
        {
          error:
            "The email you entered does not match the email registered with this MC number. Please use the email on file with FMCSA.",
          tip: "Need to update your FMCSA email? Visit https://safer.fmcsa.dot.gov/",
        },
        { status: 422 },
      );
    }
    if (!summary.active) {
      return NextResponse.json(
        {
          error: `Your MC number is not currently active with FMCSA. Status: ${summary.statusSummary || "inactive"}. Please contact FMCSA to resolve.`,
          statusCode: summary.statusSummary,
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      ok: true,
      carrier: {
        companyName: summary.companyName,
        mailingAddress: summary.mailingAddress,
        normalizedMc: normalized,
        dotNumber: summary.dotNumber,
        statusSummary: summary.statusSummary,
        fmcsaEmail: summary.fmcsaEmail,
        fmcsaData: fmcs.carrier,
      },
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[verify-mc]", e);
    return NextResponse.json({ error: "Unexpected error" }, { status: 500 });
  }
}
