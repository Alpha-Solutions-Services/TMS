"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  BadgeCheck,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Plan = "lifetime" | "monthly";

const WHATSAPP = "https://wa.me/923494206922";
const FREIGHT_SUPPORT = "info@alphasolutions.software";

const lifetimeFeatures = [
  "All 10 lessons · All quizzes",
  "Practice load board simulator",
  "Community access · Certificate paths",
  "Priority onboarding support",
];

const monthlyFeatures = [
  "Rolling access to academy modules",
  "Quizzes plus practice drills",
  "Business-day email support",
];

const planAmount: Record<Plan, string> = {
  lifetime: "$120 one-time",
  monthly: "$49/month",
};

export default function FreightStudentEnroll({
  initialReason,
}: {
  initialReason?: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [plan, setPlan] = useState<Plan>("lifetime");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [formErr, setFormErr] = useState<string | null>(null);
  const [oauthUserId, setOauthUserId] = useState<string | null>(null);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [linkExistingAccount, setLinkExistingAccount] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    void (async () => {
      const sb = createClient();
      if (!sb) return;
      const { data } = await sb.auth.getUser();
      const u = data.user;
      if (u?.id) {
        setOauthUserId(u.id);
        if (u.email) setEmail(u.email);
        const metaName =
          (typeof u.user_metadata?.full_name === "string" && u.user_metadata.full_name) ||
          (typeof u.user_metadata?.name === "string" && u.user_metadata.name) ||
          "";
        if (metaName && !name) setName(metaName);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function validateAndContinue() {
    setFormErr(null);
    if (!oauthUserId) {
      if (password !== confirm || password.length < 8) {
        setFormErr("Passwords must match and meet the 8 character minimum.");
        return;
      }
    }
    try {
      if (oauthUserId) {
        setStep(3);
        return;
      }
      const res = await fetch("/api/freight/check-student-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFormErr(typeof data.error === "string" ? data.error : "Could not validate email.");
        return;
      }
      setLinkExistingAccount(Boolean(data.exists));
      setStep(3);
    } catch {
      setFormErr("Could not validate email.");
    }
  }

  async function signInWithGoogle() {
    setFormErr(null);
    setGoogleLoading(true);
    try {
      const sb = createClient();
      if (!sb) {
        setFormErr("Google sign-in is not configured yet.");
        return;
      }
      const origin = window.location.origin;
      try {
        sessionStorage.setItem("tms_oauth_next", "/freight/student/enroll");
        sessionStorage.setItem("tms_oauth_role", "student");
      } catch {
        /* ignore */
      }
      const { error: oauthError } = await sb.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback`,
          queryParams: { prompt: "select_account" },
        },
      });
      if (oauthError) setFormErr(oauthError.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  async function submitEnrollment() {
    setSubmitting(true);
    setFormErr(null);
    try {
      const endpoint = oauthUserId || linkExistingAccount
        ? "/api/freight/complete-enrollment-existing"
        : "/api/freight/complete-enrollment";
      const body = oauthUserId || linkExistingAccount
        ? { plan, name, email }
        : { plan, name, email, password };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Enrollment failed");
      }

      if (!oauthUserId && password) {
        const supabase = createClient();
        if (supabase) await supabase.auth.signInWithPassword({ email, password });
      }

      setSubmitted(true);
      router.refresh();
    } catch (ex: unknown) {
      setFormErr(ex instanceof Error ? ex.message : "Unexpected error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <Sparkles className="mx-auto h-10 w-10 text-[var(--color-accent)]" />
        <h1
          className="mt-4 text-3xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          Academy enrollment
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
          Structured dispatch training backed by Alpha Solutions — pay via Zelle, Payoneer, Wise, or WhatsApp to activate access.
        </p>
      </div>

      {initialReason === "payment" ? (
        <p className="mb-10 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-center text-sm text-amber-100">
          Complete payment to unlock course materials — submit enrollment below and follow the payment instructions.
        </p>
      ) : null}

      {submitted ? (
        <div className="mx-auto max-w-lg rounded-3xl border border-emerald-500/30 bg-[var(--color-surface)]/40 px-8 py-10 text-center">
          <h3 className="text-lg font-bold text-[var(--color-text)]">Enrollment submitted</h3>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            Your account is created. Send payment for <strong className="text-[var(--color-text)]">{planAmount[plan]}</strong> using one of the methods below, then email {FREIGHT_SUPPORT} or message us on WhatsApp with your receipt. We activate your dashboard after payment clears.
          </p>
          <div className="mt-6 space-y-2 text-left text-sm text-[var(--color-muted)]">
            <p><strong className="text-[var(--color-text)]">Zelle:</strong> Suzy Agon · +1 (908) 848-9815</p>
            <p><strong className="text-[var(--color-text)]">Zelle:</strong> Maliha Shahid · (332) 263-3544</p>
            <p><strong className="text-[var(--color-text)]">Email:</strong> {FREIGHT_SUPPORT}</p>
          </div>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-6 inline-flex rounded-lg bg-[var(--color-accent)] px-6 py-3 text-sm font-semibold text-[#05080f]"
          >
            Message on WhatsApp
          </a>
        </div>
      ) : (
        <>
          {step <= 3 ? (
            <div className="mb-4 flex justify-center gap-2 text-[11px] uppercase tracking-[0.2em] text-[var(--color-muted)]">
              <span className={step === 1 ? "text-[var(--color-accent)]" : undefined}>Plan</span>
              <span>·</span>
              <span className={step === 2 ? "text-[var(--color-accent)]" : undefined}>Account</span>
              <span>·</span>
              <span className={step === 3 ? "text-[var(--color-accent)]" : undefined}>Payment</span>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="grid gap-6 lg:grid-cols-2">
              <button
                type="button"
                onClick={() => setPlan("monthly")}
                className={`rounded-2xl border p-8 text-left ${
                  plan === "monthly"
                    ? "border-[var(--color-accent)]/80 bg-[var(--color-accent)]/10"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]/35"
                }`}
              >
                <p className="text-xs uppercase tracking-[0.2em] text-[var(--color-muted)]">Flexible</p>
                <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
                  Monthly Access
                </h2>
                <p className="mt-2 text-[var(--color-accent)] font-bold text-2xl">
                  $49<span className="text-sm font-normal text-[var(--color-muted)]">/mo USD</span>
                </p>
                <ul className="mt-6 space-y-2 text-sm text-[var(--color-muted)]">
                  {monthlyFeatures.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
              </button>
              <button
                type="button"
                onClick={() => setPlan("lifetime")}
                className={`relative rounded-2xl border p-8 text-left ${
                  plan === "lifetime"
                    ? "border-[var(--color-accent)] shadow-[var(--glow-md)] bg-[radial-gradient(circle_at_top,_rgba(56,163,255,0.3),transparent_60%)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]/35"
                }`}
              >
                <span className="absolute right-6 top-5 rounded-full bg-[var(--color-accent)] px-3 py-0.5 text-[11px] font-bold uppercase text-[#05080f]">
                  Recommended
                </span>
                <BadgeCheck className="h-7 w-7 text-[var(--color-accent)]" />
                <h2 className="mt-4 text-2xl font-bold text-[var(--color-text)]" style={{ fontFamily: "var(--font-display)" }}>
                  Lifetime Access
                </h2>
                <p className="mt-2 text-[var(--color-accent)] font-bold text-3xl">
                  $120
                  <span className="block text-xs font-semibold uppercase tracking-[0.28em] text-[var(--color-muted)]">
                    one-time · online access
                  </span>
                </p>
                <ul className="mt-6 space-y-2 text-sm text-[var(--color-text)]">
                  {lifetimeFeatures.map((f) => (
                    <li key={f}>✓ {f}</li>
                  ))}
                </ul>
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="mt-10 flex flex-col items-center gap-6">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="inline-flex min-w-[260px] items-center justify-center rounded-lg bg-[var(--color-accent)] px-10 py-3 text-sm font-bold text-[#05080f]"
              >
                Continue with selected plan →
              </button>
              <Link href="/freight/student" className="text-sm text-[var(--color-accent)] underline">
                View syllabus & FAQs
              </Link>
            </div>
          ) : null}

          {step === 2 ? (
            <div className="mx-auto max-w-lg rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-8 py-10 space-y-4">
              {formErr ? <p className="text-sm text-red-200">{formErr}</p> : null}
              {!oauthUserId ? (
                <>
                  <button
                    type="button"
                    onClick={() => void signInWithGoogle()}
                    disabled={googleLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
                  >
                    <GoogleGlyph className="h-5 w-5 shrink-0" />
                    {googleLoading ? "Redirecting…" : "Continue with Google"}
                  </button>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-muted)]">
                    <span className="h-px flex-1 bg-[var(--color-border)]" />
                    or create a password
                    <span className="h-px flex-1 bg-[var(--color-border)]" />
                  </div>
                </>
              ) : (
                <p className="text-xs text-[var(--color-muted)] text-center">
                  Signed in with Google. Submit enrollment on the next step.
                </p>
              )}
              <label className="block text-xs text-[var(--color-muted)]">Full name</label>
              <input
                required
                className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-[var(--color-text)]"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="block text-xs text-[var(--color-muted)]">Email</label>
              <input
                required
                type="email"
                autoComplete="email"
                className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-[var(--color-text)]"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              {!oauthUserId ? (
                <>
                  <label className="block text-xs text-[var(--color-muted)]">Password · min 8 characters</label>
                  <input
                    required
                    type="password"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-[var(--color-text)]"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <label className="block text-xs text-[var(--color-muted)]">Confirm password</label>
                  <input
                    required
                    type="password"
                    className="w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-[var(--color-text)]"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </>
              ) : null}
              <button
                type="button"
                onClick={() => setStep(1)}
                className="text-xs text-[var(--color-muted)] underline"
              >
                ← Adjust plan selection
              </button>
              <button
                type="button"
                onClick={() => void validateAndContinue()}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] py-3 text-sm font-semibold text-[#05080f]"
              >
                Continue to payment
              </button>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="mx-auto mt-12 max-w-lg rounded-3xl border border-[var(--color-accent)]/30 bg-[#071021] px-8 py-10">
              {linkExistingAccount ? (
                <p className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-3 py-2 text-xs text-[var(--color-muted)]">
                  This email already has an Alpha account. After you submit, use the same password you entered above to sign in once access is activated.
                </p>
              ) : null}
              <h3 className="text-lg font-bold text-[var(--color-text)]">
                Payment — {planAmount[plan]}
              </h3>
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                We accept Zelle, Payoneer, Wise, and bank transfer. Submit enrollment first, then send payment and your receipt to activate your dashboard.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-[var(--color-muted)]">
                <li><strong className="text-[var(--color-text)]">Zelle:</strong> Suzy Agon · +1 (908) 848-9815</li>
                <li><strong className="text-[var(--color-text)]">Zelle:</strong> Maliha Shahid · (332) 263-3544</li>
                <li><strong className="text-[var(--color-text)]">Email:</strong> {FREIGHT_SUPPORT}</li>
              </ul>
              {formErr ? <p className="mt-4 text-sm text-red-200">{formErr}</p> : null}
              <button
                type="button"
                disabled={submitting}
                onClick={() => void submitEnrollment()}
                className="mt-6 inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f] disabled:opacity-40"
              >
                {submitting ? "Submitting…" : "Submit enrollment"}
              </button>
              <a
                href={WHATSAPP}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-3 inline-flex w-full items-center justify-center rounded-lg border border-[var(--color-border)] py-3 text-sm font-semibold text-[var(--color-text)]"
              >
                Pay via WhatsApp instead
              </a>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function GoogleGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden>
      <path fill="#EA4335" d="M12 10.2v3.9h5.5c-.2 1.1-.9 2.1-1.9 2.7l3 2.3c1.7-1.6 2.7-4 2.7-6.8 0-.7-.1-1.3-.2-1.9H12z" />
      <path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3-2.3c-.9.6-2 1-3.6 1-2.8 0-5.1-1.9-6-4.4l-3.1 2.4C4.9 19.9 8.2 22 12 22z" />
      <path fill="#FBBC05" d="M6 13.7c-.2-.6-.4-1.2-.4-1.9s.1-1.3.4-1.9L2.9 7.5C1.7 9.4 1 11.6 1 14s.7 4.6 1.9 6.5l3.1-2.4z" />
      <path fill="#4285F4" d="M12 5.8c1.6 0 3 .5 4.1 1.5l3.1-3.1C16.9 2.5 14.7 1.5 12 1.5 8.2 1.5 4.9 3.6 2.9 7.5l3.1 2.4c.9-2.5 3.2-4.4 6-4.4z" />
    </svg>
  );
}
