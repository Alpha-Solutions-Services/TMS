"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

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
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }
      const origin = window.location.origin;
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${origin}/auth/update-password` },
      );
      if (resetError) {
        setError(resetError.message);
        return;
      }
      setMsg(
        "If that email has an account, we sent a reset link. Check your inbox (and spam).",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Forgot password</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Enter your email and we&apos;ll send a Supabase reset link. Google-only accounts
        should use Continue with Google on the login page instead.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        ) : null}
        {msg ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{msg}</p>
        ) : null}
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="dispatch-field w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
        />
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
