"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function UpdatePasswordForm() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function prepare() {
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }

      // Recovery links may arrive as hash tokens or PKCE code on this page / callback.
      const hash = window.location.hash.slice(1);
      if (hash) {
        const params = new URLSearchParams(hash);
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (sessionError) {
            setError(sessionError.message);
            return;
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (!cancelled) {
        if (!data.session) {
          setError("Reset link expired or invalid. Request a new one.");
        } else {
          setReady(true);
        }
      }
    }
    void prepare();
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setMsg("Password updated. Redirecting to login…");
      setTimeout(() => {
        router.replace("/login");
        router.refresh();
      }, 1200);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-6">
      <h1 className="text-xl font-bold text-[var(--color-text)]">Set new password</h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Choose a new password for your Alpha Freight TMS account.
      </p>
      <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-3">
        {error ? (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
        ) : null}
        {msg ? (
          <p className="rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{msg}</p>
        ) : null}
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password"
          disabled={!ready || loading}
          className="dispatch-field w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm disabled:opacity-50"
        />
        <input
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm password"
          disabled={!ready || loading}
          className="dispatch-field w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={!ready || loading}
          className="w-full rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-bold text-[#05080f] disabled:opacity-50"
        >
          {loading ? "Saving…" : "Update password"}
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
