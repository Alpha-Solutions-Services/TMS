import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { publicTrackLoad } from "@/lib/freight/load-share-links";

const schema = z.object({
  token: z.string().min(16).max(128),
  zip: z.string().min(4).max(20),
});

/** POST — public zip-gated load tracking (no auth). */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "public-track", 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const body = schema.parse(await req.json());
    const result = await publicTrackLoad(body.token, body.zip);
    if (!result.ok) {
      const status =
        result.error === "zip_mismatch"
          ? 403
          : result.error === "expired" || result.error === "revoked"
            ? 410
            : 404;
      return NextResponse.json(
        {
          error:
            result.error === "zip_mismatch"
              ? "ZIP does not match"
              : result.error === "expired"
                ? "This tracking link has expired"
                : result.error === "revoked"
                  ? "This tracking link was revoked"
                  : "Tracking link not found",
        },
        { status },
      );
    }
    return NextResponse.json(result);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
