"use client";

/**
 * Notify support@freight + the signed-in user via /api/auth/activity-notify.
 * Await this before navigating away so the request completes.
 */
export async function notifyOpsOfSignup(email: string, role?: string) {
  await notifyAuthActivityClient("signup", { email, role });
}

export async function notifyAuthActivityClient(
  type: string,
  meta?: Record<string, unknown>,
) {
  try {
    const res = await fetch("/api/auth/activity-notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: type, ...meta }),
    });
    if (!res.ok) {
      console.warn("[notify-client] activity-notify failed", res.status);
    }
  } catch (e) {
    console.warn("[notify-client] activity-notify error", e);
  }
}
