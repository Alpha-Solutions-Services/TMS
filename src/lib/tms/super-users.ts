/** Emails from SUPER_DISPATCHER_EMAILS env only (no hardcoded defaults). */
export function getSuperDispatcherAllowlistEmails(): string[] {
  const raw =
    process.env.SUPER_DISPATCHER_EMAILS?.trim() ||
    process.env.SUPER_ADMIN_EMAILS?.trim() ||
    "";
  return raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function isEmailSuperDispatcher(email: string): boolean {
  return new Set(getSuperDispatcherAllowlistEmails()).has(email.trim().toLowerCase());
}
