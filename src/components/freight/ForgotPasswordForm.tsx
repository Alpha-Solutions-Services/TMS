"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

function toErrorMessage(err: unknown): string {
  if (typeof err === "string") {
    const t = err.trim();
    if (t && t !== "{}") return t;
  }
  if (err && typeof err === "object" && "message" in err) {
    const m = String((err as { message?: unknown }).message ?? "").trim();
    if (m && m !== "{}") return m;
  }
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  return "Could not send reset email. Try again, or use Continue with Google on the login page.";
}

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const trimmed = email.trim().toLowerCase();
      if (!trimmed) {
        setError("Enter your email address.");
        return;
      }

      // Known Google-only carrier — password reset will never work for this identity.
      if (trimmed === "alphafreightsnetwork@gmail.com") {
        setError(
          "This account signs in with Google only. Go back to login, select Carrier, then Continue with Google.",
        );
        return;
      }

      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }

      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${origin}/auth/update-password`,
      });

      if (resetError) {
        setError(toErrorMessage(resetError));
        return;
      }

      setMsg(
        "If that email has a password-based account, we sent a reset link. Check inbox and spam. Google-only accounts must use Continue with Google instead.",
      );
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Forgot password</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Enter your email and we&apos;ll send a reset link. Accounts that only use Google sign-in
        cannot reset a password — use <strong>Continue with Google</strong> on the login page.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300" role="alert">
            {error}
          </p>
        ) : null}
        {msg ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300" role="status">
            {msg}
          </p>
        ) : null}
        <label className="block text-xs text-[var(--color-muted)]">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            className="dispatch-field mt-1 w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm text-[var(--color-text)]"
          />
        </label>
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-bold text-[#05080f] disabled:opacity-50"
        >
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>
      <p className="mt-4 text-center text-xs text-[var(--color-muted)]">
        <Link href="/login" className="text-[var(--color-accent)] hover:underline">
          Back to login
        </Link>
      </p>
    </div>
  );
}
