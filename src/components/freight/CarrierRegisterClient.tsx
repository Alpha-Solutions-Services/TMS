"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function CarrierRegisterClient() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [mc, setMc] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [fallback, setFallback] = useState(false);
  const [oauthUserId, setOauthUserId] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const [companyNameDisplay, setCompanyNameDisplay] = useState("");
  const [companyAddressDisplay, setCompanyAddressDisplay] = useState("");
  const [normalizedMcDisplay, setNormalizedMcDisplay] = useState("");
  const [dotDisplay, setDotDisplay] = useState<string | undefined>();

  const [contactName, setContactName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [tos, setTos] = useState(false);
  const [companyManual, setCompanyManual] = useState("");
  const [addrManual, setAddrManual] = useState("");

  useEffect(() => {
    void (async () => {
      const sb = createClient();
      if (!sb) return;
      const { data } = await sb.auth.getUser();
      if (data.user?.id) {
        setOauthUserId(data.user.id);
        if (data.user.email) setEmail(data.user.email);
      }
    })();
  }, []);

  async function signInWithGoogle() {
    setErr(null);
    setGoogleLoading(true);
    try {
      const sb = createClient();
      if (!sb) {
        setErr("Google sign-in is not configured yet.");
        return;
      }
      const origin = window.location.origin;
      const { error: oauthError } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
            "/freight/carrier/register"
          )}&freight=1&role=carrier`,
        },
      });
      if (oauthError) setErr(oauthError.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function verifyMc() {
    setErr(null);
    setLoading(true);
    setFallback(false);
    try {
      const res = await fetch("/api/freight/verify-mc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mcNumber: mc, email }),
      });
      const data = await res.json();
      if (data.fallback) {
        setFallback(true);
        setCompanyManual("");
        setAddrManual("");
        setStep(2);
      } else if (!res.ok) {
        setErr(data.error ?? "Verification failed.");
      } else if (data.ok && data.carrier) {
        setCompanyNameDisplay(data.carrier.companyName);
        setCompanyAddressDisplay(data.carrier.mailingAddress);
        setNormalizedMcDisplay(data.carrier.normalizedMc);
        setDotDisplay(data.carrier.dotNumber);
        setStep(2);
      }
    } catch {
      setErr("Network error");
    } finally {
      setLoading(false);
    }
  }

  async function createAccount(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    if (!oauthUserId) {
      if (password !== confirmPw || password.length < 8) {
        setErr("Passwords must match and be at least 8 characters.");
        return;
      }
    }
    if (!tos) {
      setErr("Terms acceptance required.");
      return;
    }
    setLoading(true);
    try {
      const payload = {
        email,
        password: oauthUserId ? undefined : password,
        contactName,
        phone,
        mcNumber: normalizedMcDisplay || mc,
        companyName: fallback ? companyManual : companyNameDisplay,
        companyAddress: fallback ? addrManual : companyAddressDisplay,
        allowManualVerification: fallback,
      };
      const endpoint = oauthUserId
        ? "/api/freight/register-carrier-oauth"
        : "/api/freight/register-carrier";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.needsManualAck) setErr(`${data.error}`);
        else setErr(data.error || "Registration failed");
        return;
      }
      router.replace("/freight/carrier/pending");
      router.refresh();
    } catch {
      setErr("Could not submit");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl pb-24 pt-12 px-4">
      <h1 className="text-center text-3xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
        Register as a carrier
      </h1>
      <p className="mx-auto mt-4 max-w-lg text-center text-sm text-[var(--color-muted)]">
        We cross-check FMCSA filings so only active motor carriers with matching authority email can auto-verify.
      </p>

      {step === 1 ? (
        <div className="mx-auto mt-12 max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-8 py-10">
          {err ? <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{err}</p> : null}
          {!oauthUserId ? (
            <>
              <button
                type="button"
                onClick={() => void signInWithGoogle()}
                disabled={loading || googleLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
              >
                <GoogleGlyph className="h-5 w-5 shrink-0" />
                {googleLoading ? "Redirecting…" : "Continue with Google"}
              </button>
              <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                <span className="h-px flex-1 bg-[var(--color-border)]" />
                or register with password
                <span className="h-px flex-1 bg-[var(--color-border)]" />
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--color-muted)] text-center">
              Signed in with Google. Enter your MC number below and verify to open your carrier workspace.
            </p>
          )}
          <label className="block text-xs text-[var(--color-muted)]">MC number</label>
          <input
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2"
            placeholder="digits only · MC prefix optional"
            value={mc}
            onChange={(e) => setMc(e.target.value)}
          />
          <label className="block text-xs text-[var(--color-muted)]">Email registered with FMCSA</label>
          <input
            type="email"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button
            type="button"
            disabled={loading}
            onClick={verifyMc}
            className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f]"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Verify MC number
          </button>
          <Link href="/freight/login" className="mt-6 block text-center text-xs text-[var(--color-muted)] underline">
            Already registered? Carrier login →
          </Link>
        </div>
      ) : (
        <>
          {!fallback ? (
            <div className="mx-auto mt-10 max-w-md rounded-2xl border border-emerald-500/35 bg-emerald-500/10 p-8">
              <p className="flex items-center gap-2 font-semibold text-emerald-200">
                <CheckCircle2 className="h-5 w-5" /> MC verified
              </p>
              <dl className="mt-6 space-y-2 text-sm text-[var(--color-text)]">
                <dt className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Legal name</dt>
                <dd>{companyNameDisplay}</dd>
                <dt className="mt-4 text-xs uppercase tracking-wide text-[var(--color-muted)]">Authority</dt>
                <dd>MC {normalizedMcDisplay}</dd>
                {dotDisplay ? <dd>DOT {dotDisplay}</dd> : null}
                <dt className="mt-4 text-xs uppercase tracking-wide text-[var(--color-muted)]">HQ / mailing footprint</dt>
                <dd>{companyAddressDisplay}</dd>
              </dl>
              <p className="mt-6 text-[11px] text-[var(--color-muted)]">
                Complete the secure form below — fields marked readonly mirror FMCSA.
              </p>
            </div>
          ) : (
            <div className="mx-auto mt-10 max-w-md rounded-2xl border border-amber-500/35 bg-amber-500/10 p-8 text-sm text-amber-100">
              FMCSA offline or key missing — list your DOT-legal trading name manually. Dispatch will reconcile filings.
              <label className="mt-6 block text-xs text-[var(--color-muted)]">Company name</label>
              <input
                required
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-[var(--color-text)]"
                value={companyManual}
                onChange={(e) => setCompanyManual(e.target.value)}
              />
              <label className="mt-4 block text-xs text-[var(--color-muted)]">Company address</label>
              <textarea
                required
                rows={3}
                className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-[var(--color-text)]"
                value={addrManual}
                onChange={(e) => setAddrManual(e.target.value)}
              />
            </div>
          )}

          <form onSubmit={createAccount} className="mx-auto mt-10 max-w-md space-y-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-8 py-10">
            {!fallback ? (
              <>
                <label className="text-xs text-[var(--color-muted)]">Company (readonly)</label>
                <input readOnly value={companyNameDisplay} className="w-full cursor-not-allowed rounded-lg border border-[var(--color-border)] bg-[#0b1120] px-3 py-2 opacity-80" />
                <label className="text-xs text-[var(--color-muted)]">MC (readonly)</label>
                <input readOnly value={normalizedMcDisplay} className="w-full cursor-not-allowed rounded-lg border border-[var(--color-border)] bg-[#0b1120] px-3 py-2 opacity-80" />
              </>
            ) : null}
            <label className="text-xs text-[var(--color-muted)]">Contact / dispatcher owner name</label>
            <input required value={contactName} onChange={(e) => setContactName(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2" />
            <label className="text-xs text-[var(--color-muted)]">Mobile</label>
            <input required value={phone} onChange={(e) => setPhone(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2" />
            {!oauthUserId ? (
              <>
                <label className="text-xs text-[var(--color-muted)]">Password</label>
                <input required type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2" />
                <label className="text-xs text-[var(--color-muted)]">Confirm password</label>
                <input required type="password" value={confirmPw} onChange={(e) => setConfirmPw(e.target.value)} className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2" />
              </>
            ) : (
              <p className="text-xs text-[var(--color-muted)]">
                You’re using Google sign-in. No password needed.
              </p>
            )}
            <label className="inline-flex gap-3 text-xs text-[var(--color-muted)]">
              <input type="checkbox" checked={tos} onChange={(e) => setTos(e.target.checked)} />
              I agree to Alpha Freight Terms of Service &amp; data handling disclosures.
            </label>
            {err ? <p className="text-sm text-red-200">{err}</p> : null}
            <button disabled={loading} type="submit" className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f]">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create carrier account"}
            </button>
          </form>
        </>
      )}
    </div>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path
        fill="#EA4335"
        d="M12 10.2v3.9h5.5c-.2 1.1-.9 2.1-1.9 2.7l3 2.3c1.7-1.6 2.7-4 2.7-6.8 0-.7-.1-1.3-.2-1.9H12z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 5-.9 6.6-2.4l-3-2.3c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-6-4.4l-3.1 2.4C4.9 19.9 8.2 22 12 22z"
      />
      <path
        fill="#FBBC05"
        d="M6 13.7c-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9L2.9 7.5C1.7 9.4 1 11.6 1 14s.7 4.6 1.9 6.5l3.1-2.4z"
      />
      <path
        fill="#4285F4"
        d="M12 5.8c1.6 0 3 .5 4.1 1.5l3.1-3.1C16.9 2.5 14.7 1.5 12 1.5 8.2 1.5 4.9 3.6 2.9 7.5l3.1 2.4c.9-2.5 3.2-4.4 6-4.4z"
      />
    </svg>
  );
}
