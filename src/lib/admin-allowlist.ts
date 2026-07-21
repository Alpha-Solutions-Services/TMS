const FALLBACK_ADMIN_EMAILS = [
  "alphaassistant.alpha@gmail.com",
  "muhammadmikran.alpha@gmail.com",
] as const;

export const SUPER_ADMIN_EMAILS = [...FALLBACK_ADMIN_EMAILS] as const;

function normalize(email: string): string {
  return email.trim().toLowerCase();
}

export function getAdminAllowlist(): string[] {
  const envRaw = process.env.ADMIN_EMAILS?.trim();
  if (envRaw) {
    return envRaw
      .split(",")
      .map((s) => normalize(s))
      .filter(Boolean);
  }
  return FALLBACK_ADMIN_EMAILS.map(normalize);
}

export function isAllowedAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return new Set(getAdminAllowlist()).has(normalize(email));
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return new Set(SUPER_ADMIN_EMAILS.map(normalize)).has(normalize(email));
}

export const ADMIN_LOGIN_HINT_EMAILS = [...FALLBACK_ADMIN_EMAILS];
