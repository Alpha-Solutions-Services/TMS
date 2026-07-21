"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ClipboardList, Truck, IdCard } from "lucide-react";
import { useMemo, useState } from "react";
import { notifyAuthActivityClient } from "@/lib/auth/notify-client";
import { createClient } from "@/lib/supabase/client";
import { isSuperAdminEmail } from "@/lib/admin-allowlist";
import { isAllowedDispatcherEmail } from "@/lib/dispatcher-allowlist";

type Role = "dispatcher" | "carrier" | "driver";

const cards: {
  id: Role;
  title: string;
  description: string;
  sub: string;
  icon: React.ReactNode;
  cta: string;
  footer?: React.ReactNode;
}[] = [
  {
    id: "dispatcher",
    title: "Dispatcher",
    description: "Manage loads, carriers, and drivers",
    sub: "Login with your Alpha Freight credentials",
    icon: <ClipboardList className="h-9 w-9 text-[var(--color-accent)]" />,
    cta: "Login as Dispatcher",
  },
  {
    id: "carrier",
    title: "Carrier",
    description: "View loads and manage your fleet",
    sub: "Login with your verified MC number account",
    icon: <Truck className="h-9 w-9 text-[var(--color-accent)]" />,
    cta: "Login as Carrier",
    footer: (
      <p className="mt-4 text-xs text-[var(--color-muted)]">
        New carrier?{" "}
        <Link
          href="/carrier/register"
          className="font-semibold text-[var(--color-accent)] hover:underline"
        >
          Register with MC Number
        </Link>
      </p>
    ),
  },
  {
    id: "driver",
    title: "Driver",
    description: "View your loads and update delivery status",
    sub: "Drivers must be invited by their carrier or dispatcher",
    icon: <IdCard className="h-9 w-9 text-[var(--color-accent)]" />,
    cta: "Login as Driver",
    footer: (
      <p className="mt-4 text-xs text-[var(--color-muted)]">
        Waiting for an invite? Check your email.
      </p>
    ),
  },
];

export function FreightLoginForm() {
  const router = useRouter();
  const sp = useSearchParams();
  const next = sp?.get("next") ?? "";
  const urlError = sp?.get("error");

  const [role, setRole] = useState<Role>("dispatcher");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const redirectTarget = useMemo(() => {
    switch (role) {
      case "dispatcher":
        return "/dispatcher/dashboard";
      case "carrier":
        return "/carrier/dashboard";
      case "driver":
        return "/driver/dashboard";
      default:
        return "/login";
    }
  }, [role]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(urlError === "auth" ? "Google sign-in could not be completed. Try again." : null);
    setLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Supabase is not configured.");
        setLoading(false);
        return;
      }

      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signErr) {
        setError(signErr.message || "Unable to login");
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      const emailSignedIn = data.user?.email ?? "";
      if (!uid) {
        setError("No user returned");
        setLoading(false);
        return;
      }

      let { data: profile } = await supabase
        .from("profiles")
        .select("role, enrollment_status, carrier_status")
        .eq("id", uid)
        .maybeSingle();

      const superAdmin = isSuperAdminEmail(emailSignedIn);
      if (role === "dispatcher" && !superAdmin && !isAllowedDispatcherEmail(emailSignedIn)) {
        await supabase.auth.signOut();
        setError("Dispatcher access is restricted to authorized accounts.");
        setLoading(false);
        return;
      }
      if (
        role === "dispatcher" &&
        !superAdmin &&
        isAllowedDispatcherEmail(emailSignedIn) &&
        (!profile?.role || profile.role === "client")
      ) {
        const ensureRes = await fetch("/api/freight/dispatcher/ensure-profile", {
          method: "POST",
        });
        if (!ensureRes.ok) {
          setError("Unable to provision dispatcher access. Please contact support.");
          setLoading(false);
          return;
        }
        const { data: ensuredProfile } = await supabase
          .from("profiles")
          .select("role, enrollment_status, carrier_status")
          .eq("id", uid)
          .maybeSingle();
        profile = ensuredProfile;
      }

      if (role === "carrier" && profile?.role === "client") {
        notifyAuthActivityClient("login");
        router.replace("/carrier/register");
        router.refresh();
        setLoading(false);
        return;
      }

      if (role === "driver" && profile?.role === "client") {
        setError(
          "This account isn't set up as a driver yet. Open the invitation link from your email and finish signup with the same email and password.",
        );
        setLoading(false);
        return;
      }

      if (!profile?.role || profile.role !== role) {
        if (superAdmin && role !== "driver") {
          const res = await fetch("/api/freight/superadmin/set-role", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(body?.error || "Unable to switch role.");
            setLoading(false);
            return;
          }
        } else {
          await supabase.auth.signOut();
          setError(`This account is not a ${role}. Pick the matching role card.`);
          setLoading(false);
          return;
        }
      }

      let dest = next || redirectTarget;

      if (role === "carrier") {
        if (profile?.carrier_status === "verified") dest = "/carrier/dashboard";
        else if (profile?.carrier_status === "rejected") dest = "/carrier/rejected";
        else if (profile?.carrier_status === "suspended") dest = "/carrier/suspended";
        else dest = "/carrier/pending";
      }

      notifyAuthActivityClient("login");
      router.replace(dest);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function signInWithGoogle() {
    setError(null);
    setGoogleLoading(true);
    try {
      if (role === "driver") {
        setError("Drivers are invite-only. Use the invite link sent to your email.");
        return;
      }
      const supabase = createClient();
      if (!supabase) {
        setError("Google sign-in is not configured.");
        return;
      }
      const origin = window.location.origin;
      const nextPath = next && next.startsWith("/") && !next.startsWith("//") ? next : undefined;
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(
            nextPath ?? "/login"
          )}&freight=1&role=${encodeURIComponent(role)}`,
        },
      });
      if (oauthError) setError(oauthError.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <div className="mx-auto mt-12 max-w-5xl px-4 pb-24 pt-10 sm:px-6 lg:px-8">
      <div className="mb-12 text-center">
        <Image
          src="/afn-logo.png"
          alt="Alpha Freight Network"
          width={72}
          height={72}
          className="mx-auto mb-4 rounded-full"
        />
        <h1
          className="text-3xl font-bold text-[var(--color-text)] sm:text-4xl"
          style={{ fontFamily: "var(--font-display), sans-serif" }}
        >
          Alpha Freight Network TMS
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-sm text-[var(--color-muted)]">
          tms.alphasolutions.software — secure access by role
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setRole(c.id)}
            className={`rounded-2xl border p-6 text-left transition-all ${
              role === c.id
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/10 shadow-[0_0_0_1px_rgba(56,163,255,0.35)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)]/30 hover:border-[var(--color-accent)]/25"
            }`}
          >
            <div className="mb-3 flex justify-between gap-3">
              {c.icon}
              {role === c.id ? (
                <span className="rounded-full bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-bold uppercase text-[#05080f]">
                  Selected
                </span>
              ) : null}
            </div>
            <h2
              className="text-lg font-bold text-[var(--color-text)]"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {c.title}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-text)]">{c.description}</p>
            <p className="mt-2 text-xs text-[var(--color-muted)]">{c.sub}</p>
            <span className="mt-6 inline-block text-xs font-semibold uppercase tracking-wide text-[var(--color-accent)]">
              → {c.cta}
            </span>
          </button>
        ))}
      </div>

      <div className="mx-auto mt-14 max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-8">
        <button
          type="button"
          onClick={() => void signInWithGoogle()}
          disabled={loading || googleLoading}
          className="mb-5 flex w-full items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-4 py-2.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-50"
        >
          <GoogleGlyph className="h-5 w-5 shrink-0" />
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        <div className="mb-5 flex items-center gap-3 text-xs text-[var(--color-muted)]">
          <span className="h-px flex-1 bg-[var(--color-border)]" />
          or sign in with password
          <span className="h-px flex-1 bg-[var(--color-border)]" />
        </div>

        <form onSubmit={submit} className="space-y-4">
          {error ? (
            <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-200">{error}</p>
          ) : null}
          <div>
            <label className="text-xs font-medium text-[var(--color-muted)]" htmlFor="fe">
              Email
            </label>
            <input
              id="fe"
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)] outline-none ring-1 ring-transparent focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="text-xs font-medium text-[var(--color-muted)]" htmlFor="fp">
              Password
            </label>
            <input
              id="fp"
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)] outline-none ring-1 ring-transparent focus:border-[var(--color-accent)] focus:ring-[var(--color-accent)]"
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
            />
          </div>
          <button
            type="submit"
            disabled={loading || googleLoading}
            className="inline-flex w-full items-center justify-center rounded-lg bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f] transition-opacity hover:opacity-95 disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in securely"}
          </button>
          <div className="text-center">{cards.find((x) => x.id === role)?.footer}</div>
        </form>
      </div>
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
