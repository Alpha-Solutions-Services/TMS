import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import {
  aiRateLimitKey,
  AI_RATE_LIMIT,
  checkRateLimit,
} from "@/lib/freight/rate-limit";

export async function enforceAiRateLimit(
  route: "chat" | "parse-load" | "parse-document",
): Promise<{ userId: string } | NextResponse> {
  const user = await getPortalUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = checkRateLimit({
    key: aiRateLimitKey(user.id, route),
    ...AI_RATE_LIMIT,
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        error: `Rate limit exceeded. Try again in ${Math.ceil(result.retryAfterMs / 1000)}s.`,
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(result.retryAfterMs / 1000)) },
      },
    );
  }

  return { userId: user.id };
}
