const FALLBACK_DISPATCHER_EMAILS = [
  "mikran.dispatch@gmail.com",
  "alphaassistant.alpha@gmail.com",
  "muhammadmikran.alpha@gmail.com",
  "sarmad.dispatch@gmail.com",
] as const;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function getDispatcherAllowlist(): string[] {
  const envRaw = process.env.DISPATCHER_EMAILS?.trim();
  if (envRaw) {
    return envRaw
      .split(",")
      .map((s) => normalize(s))
      .filter(Boolean);
  }
  return FALLBACK_DISPATCHER_EMAILS.map(normalize);
}

export function isAllowedDispatcherEmail(
  email: string | null | undefined,
): boolean {
  if (!email) return false;
  return new Set(getDispatcherAllowlist()).has(normalize(email));
}

