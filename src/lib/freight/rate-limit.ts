/**
 * In-memory sliding-window rate limiter (per-process stopgap).
 * For production multi-instance deploys, swap to Upstash/Vercel KV.
 */

type Entry = { count: number; windowStart: number };

const buckets = new Map<string, Entry>();

export type RateLimitResult =
  | { ok: true; remaining: number; resetMs: number }
  | { ok: false; retryAfterMs: number };

export function checkRateLimit(params: {
  key: string;
  limit: number;
  windowMs: number;
}): RateLimitResult {
  const now = Date.now();
  const entry = buckets.get(params.key);

  if (!entry || now - entry.windowStart >= params.windowMs) {
    buckets.set(params.key, { count: 1, windowStart: now });
    return { ok: true, remaining: params.limit - 1, resetMs: params.windowMs };
  }

  if (entry.count >= params.limit) {
    const retryAfterMs = params.windowMs - (now - entry.windowStart);
    return { ok: false, retryAfterMs: Math.max(retryAfterMs, 1000) };
  }

  entry.count += 1;
  return {
    ok: true,
    remaining: params.limit - entry.count,
    resetMs: params.windowMs - (now - entry.windowStart),
  };
}

export function aiRateLimitKey(userId: string, route: string): string {
  return `ai:${route}:${userId}`;
}

/** Default: 30 Groq calls per user per 10 minutes per route. */
export const AI_RATE_LIMIT = { limit: 30, windowMs: 10 * 60 * 1000 };
