"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function MfaChallengeForm({
  onVerified,
  onCancel,
}: {
  onVerified: () => void | Promise<void>;
  onCancel?: () => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setError(factors.error.message);
        return;
      }
      const totp = factors.data?.totp?.find((f) => f.status === "verified");
      if (!totp) {
        setError("No verified authenticator found on this account.");
        return;
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId: totp.id });
      if (challenge.error || !challenge.data) {
        setError(challenge.error?.message ?? "Could not start MFA challenge");
        return;
      }
      const verified = await supabase.auth.mfa.verify({
        factorId: totp.id,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) {
        setError(verified.error.message);
        return;
      }
      await onVerified();
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-3">
      <p className="text-sm text-[var(--color-muted)]">
        Enter the 6-digit code from your authenticator app to finish signing in.
      </p>
      {error ? (
        <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      ) : null}
      <input
        inputMode="numeric"
        autoComplete="one-time-code"
        required
        maxLength={8}
        value={code}
        onChange={(e) => setCode(e.target.value)}
        placeholder="Authentication code"
        className="dispatch-field w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
      />
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-bold text-[#05080f] disabled:opacity-50"
      >
        {loading ? "Verifying…" : "Verify and continue"}
      </button>
      {onCancel ? (
        <button
          type="button"
          onClick={onCancel}
          className="w-full text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          Cancel
        </button>
      ) : null}
    </form>
  );
}
