"use client";

/**
 * Fire-and-forget auth activity email to support@freight…
 * Server signup routes call deliverAuthNotifications directly.
 */
export async function notifyOpsOfSignup(email: string, role?: string) {
  void notifyAuthActivityClient("signup", { email, role });
}

export async function notifyAuthActivityClient(
  type: string,
  meta?: Record<string, unknown>,
) {
  try {
    await fetch("/api/auth/activity-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: type, ...meta }),
      keepalive: true,
    });
  } catch {
    // non-blocking
  }
}
