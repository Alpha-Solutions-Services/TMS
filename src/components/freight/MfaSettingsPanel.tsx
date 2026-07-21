"use client";

import { useCallback, useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Factor = {
  id: string;
  friendly_name?: string | null;
  factor_type: string;
  status: string;
};

export function MfaSettingsPanel() {
  const [factors, setFactors] = useState<Factor[]>([]);
  const [enrolling, setEnrolling] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const supabase = createClient();
    if (!supabase) return;
    const { data, error: listError } = await supabase.auth.mfa.listFactors();
    if (listError) {
      setError(listError.message);
      return;
    }
    setFactors([...(data?.totp ?? []), ...(data?.phone ?? [])] as Factor[]);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function startEnroll() {
    setError(null);
    setMsg(null);
    setBusy(true);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "Authenticator app",
      });
      if (enrollError || !data) {
        setError(enrollError?.message ?? "Could not start MFA enrollment");
        return;
      }
      setFactorId(data.id);
      setQr(data.totp.qr_code);
      setSecret(data.totp.secret);
      setEnrolling(true);
    } finally {
      setBusy(false);
    }
  }

  async function verifyEnroll() {
    if (!factorId || code.trim().length < 6) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }
      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error || !challenge.data) {
        setError(challenge.error?.message ?? "Challenge failed");
        return;
      }
      const verified = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verified.error) {
        setError(verified.error.message);
        return;
      }
      setMsg("Two-factor authentication is enabled.");
      setEnrolling(false);
      setQr(null);
      setSecret(null);
      setCode("");
      setFactorId(null);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function unenroll(id: string) {
    if (!window.confirm("Remove this authenticator?")) return;
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      if (!supabase) return;
      const { error: unenrollError } = await supabase.auth.mfa.unenroll({ factorId: id });
      if (unenrollError) {
        setError(unenrollError.message);
        return;
      }
      setMsg("Authenticator removed.");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const verified = factors.filter((f) => f.status === "verified");

  return (
    <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
      <h2 className="text-sm font-semibold text-[var(--color-text)]">Two-factor authentication</h2>
      <p className="mt-1 text-xs text-[var(--color-muted)]">
        Use an authenticator app (Google Authenticator, Authy, 1Password). Powered by Supabase MFA
        (TOTP).
      </p>

      {error ? (
        <p className="mt-3 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
      ) : null}
      {msg ? (
        <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300">{msg}</p>
      ) : null}

      <ul className="mt-4 space-y-2">
        {verified.length === 0 ? (
          <li className="text-xs text-[var(--color-muted)]">No authenticator enrolled yet.</li>
        ) : (
          verified.map((f) => (
            <li
              key={f.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm"
            >
              <span className="text-[var(--color-text)]">
                {f.friendly_name || f.factor_type} · {f.status}
              </span>
              <button
                type="button"
                disabled={busy}
                onClick={() => void unenroll(f.id)}
                className="text-xs text-red-300 hover:underline disabled:opacity-50"
              >
                Remove
              </button>
            </li>
          ))
        )}
      </ul>

      {!enrolling ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => void startEnroll()}
          className="mt-4 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
        >
          {busy ? "Working…" : "Enable authenticator"}
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          {qr ? (
            <div
              className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-white p-3 [&_svg]:mx-auto [&_svg]:h-48 [&_svg]:w-48"
              dangerouslySetInnerHTML={{ __html: qr }}
            />
          ) : null}
          {secret ? (
            <p className="break-all text-xs text-[var(--color-muted)]">
              Or enter secret manually: <code className="text-[var(--color-accent)]">{secret}</code>
            </p>
          ) : null}
          <input
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="6-digit code"
            className="dispatch-field w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => void verifyEnroll()}
            className="w-full rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-bold text-[#05080f] disabled:opacity-50"
          >
            {busy ? "Verifying…" : "Verify and enable"}
          </button>
        </div>
      )}
    </div>
  );
}
