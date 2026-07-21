"use client";

import { useState } from "react";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

export function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Auth is not configured");
      setBusy(false);
      return;
    }

    try {
      const { error: err } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (err) throw err;
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (!supabase) {
      setError("Auth is not configured (missing Supabase env)");
      setBusy(false);
      return;
    }
    try {
      sessionStorage.setItem("tms_oauth_next", "/");
    } catch {
      /* ignore */
    }
    const redirectTo = `${window.location.origin}/auth/callback`;
    const { error: err } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo,
        queryParams: { access_type: "offline", prompt: "select_account" },
      },
    });
    if (err) {
      setError(
        err.message.includes("provider")
          ? "Google sign-in is not enabled in Supabase Auth → Providers."
          : `${err.message} — add ${redirectTo} to Supabase Redirect URLs.`
      );
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-8 shadow-[var(--glow-md)]">
      <div className="mb-6 flex flex-col items-center text-center">
        <Image
          src="/afn-logo.png"
          alt="Alpha Freight Network"
          width={80}
          height={80}
          className="mb-3 rounded-full"
        />
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          Alpha Freight Network
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          TMS — tms.alphasolutions.software
        </p>
      </div>

      <form onSubmit={(e) => void onSubmit(e)} className="space-y-4">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        <input
          type="password"
          required
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-3 text-sm text-[var(--color-text)] outline-none focus:ring-2 focus:ring-[var(--color-accent)]"
        />
        {error ? <p className="text-sm text-red-400">{error}</p> : null}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-[var(--color-accent)] py-3 text-sm font-semibold text-[#05080f] disabled:opacity-50"
        >
          {busy ? "Please wait…" : "Sign in"}
        </button>
      </form>

      <button
        type="button"
        onClick={() => void google()}
        className="mt-3 w-full rounded-xl border border-[var(--color-border)] py-3 text-sm text-[var(--color-text)] hover:bg-[var(--color-surface)]"
      >
        Continue with Google
      </button>

      <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
        Dispatcher · Carrier · Driver portals
      </p>
    </div>
  );
}
