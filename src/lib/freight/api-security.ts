import type { NextRequest } from "next/server";

const rateBucket = new Map<string, { count: number; resetAt: number }>();

/** Strip control chars and cap length — reduces injection in emails/PDFs. */
export function sanitizeText(input: string, maxLen = 500): string {
  return input
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\ufeff]/g, "")
    .trim()
    .slice(0, maxLen);
}

export function sanitizeMoney(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.max(-999_999_999, Math.min(999_999_999, n)) * 100) / 100;
}

/** Simple in-memory rate limit per IP + route (resets each minute). */
export function checkRateLimit(
  req: NextRequest,
  routeKey: string,
  maxPerMinute = 30,
): boolean {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const key = `${routeKey}:${ip}`;
  const now = Date.now();
  const entry = rateBucket.get(key);
  if (!entry || now > entry.resetAt) {
    rateBucket.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (entry.count >= maxPerMinute) return false;
  entry.count += 1;
  return true;
}

export function verifyCronSecret(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export function isFridayUtc(): boolean {
  return new Date().getUTCDay() === 5;
}
