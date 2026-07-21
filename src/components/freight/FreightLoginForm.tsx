"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ClipboardList, Truck, IdCard } from "lucide-react";
import { useMemo, useState } from "react";
import clsx from "clsx";
import { notifyAuthActivityClient } from "@/lib/auth/notify-client";
import { createClient } from "@/lib/supabase/client";
import { isSuperAdminEmail } from "@/lib/admin-allowlist";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";

type Role = "dispatcher" | "carrier" | "driver";

const ROLES: {
  id: Role;
  label: string;
  hint: string;
  icon: typeof ClipboardList;
}[] = [
  {
    id: "dispatcher",
    label: "Dispatcher",
    hint: "Authorized dispatch accounts only.",
    icon: ClipboardList,
  },
  {
    id: "carrier",
    label: "Carrier",
    hint: "Verified MC carrier account.",
    icon: Truck,
  },
  {
    id: "driver",
    label: "Driver",
    hint: "Invite-only — check your email.",
    icon: IdCard,
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
  const [error, setError] = useState<string | null>(
    urlError === "auth"
      ? "Google sign-in failed. Try again."
      : urlError === "terminated"
        ? "Your dispatcher access has been terminated."
        : null,
  );
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
    setError(null);
    setLoading(true);

    try {
      const supabase = createClient();
      if (!supabase) {
        setError("Auth is not configured.");
        return;
      }

      const trimmedEmail = email.trim().toLowerCase();
      const { error: signErr } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signErr) {
        setError(signErr.message || "Unable to sign in");
        return;
      }

      const { data } = await supabase.auth.getUser();
      const uid = data.user?.id;
      const emailSignedIn = data.user?.email ?? "";
      if (!uid) {
        setError("Sign-in failed. Try again.");
        return;
      }

      let { data: profile } = await supabase
        .from("profiles")
        .select("role, enrollment_status, carrier_status")
        .eq("id", uid)
        .maybeSingle();

      const superAdmin = isSuperAdminEmail(emailSignedIn);
      const superDispatcher = isSuperDispatcherEmail(emailSignedIn) || superAdmin;

      if (role === "dispatcher" && !superDispatcher) {
        const { data: tmsRow } = await supabase
          .from("tms_users")
          .select("role, active")
          .eq("id", uid)
          .maybeSingle();

        if (!tmsRow || tmsRow.role !== "sub_dispatcher" || !tmsRow.active) {
          await supabase.auth.signOut();
          setError("Sub dispatcher access requires an invitation from a super dispatcher.");
          return;
        }
      }

      if (role === "dispatcher") {
        const ensureRes = await fetch("/api/freight/dispatcher/ensure-profile", {
          method: "POST",
        });
        if (!ensureRes.ok) {
          const body = (await ensureRes.json().catch(() => ({}))) as { error?: string };
          await supabase.auth.signOut();
          setError(body.error ?? "Unable to provision dispatcher access.");
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
        return;
      }

      if (role === "driver" && profile?.role === "client") {
        setError("Use your driver invite link to finish setup first.");
        return;
      }

      if (!profile?.role || profile.role !== role) {
        if (superDispatcher && role !== "driver") {
          const res = await fetch("/api/freight/superadmin/set-role", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ role }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok) {
            setError(body?.error || "Unable to switch role.");
            return;
          }
        } else {
          await supabase.auth.signOut();
          setError(`This account is not a ${role}. Select the correct role above.`);
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
        setError("Drivers must use their invite link.");
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
            nextPath ?? "/login",
          )}&freight=1&role=${encodeURIComponent(role)}`,
        },
      });
      if (oauthError) setError(oauthError.message);
    } finally {
      setGoogleLoading(false);
    }
  }

  const activeRole = ROLES.find((r) => r.id === role)!;

  return (
    <div className="flex min-h-[100dvh] items-center justify-center px-4 py-6">
      <div className="w-full max-w-md">
        <div className="mb-5 text-center">
          <Image
            src="/afn-logo.png"
            alt="Alpha Freight Network"
            width={48}
            height={48}
            className="mx-auto mb-2 rounded-full"
            priority
          />
          <h1
            className="text-lg font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Alpha Freight TMS
          </h1>
          <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
            tms.alphasolutions.software
          </p>
        </div>

        {/* Compact role cards */}
        <div className="mb-4 grid grid-cols-3 gap-2">
          {ROLES.map(({ id, label, icon: Icon }) => {
            const selected = role === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setRole(id)}
                className={clsx(
                  "relative flex min-h-[84px] flex-col items-center justify-center overflow-hidden rounded-xl border px-2 pb-3 pt-2 text-center transition-colors",
                  selected
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface)]/50 hover:border-[var(--color-accent)]/35",
                )}
              >
                {selected ? (
                  <span className="absolute inset-x-0 top-0 bg-[var(--color-accent)] py-0.5 text-[8px] font-bold uppercase leading-none tracking-wider text-[#05080f]">
                    Selected
                  </span>
                ) : null}
                <Icon
                  className={clsx(
                    "mb-1 h-4 w-4 shrink-0",
                    selected ? "mt-4 text-[var(--color-accent)]" : "mt-1 text-[var(--color-muted)]",
                  )}
                />
                <span
                  className={clsx(
                    "text-[11px] font-semibold leading-tight",
                    selected ? "text-[var(--color-text)]" : "text-[var(--color-muted)]",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mb-3 text-center text-[11px] text-[var(--color-muted)]">
          {activeRole.hint}
          {role === "carrier" ? (
            <>
              {" "}
              <Link href="/carrier/register" className="text-[var(--color-accent)] hover:underline">
                Register
              </Link>
            </>
          ) : null}
        </p>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 shadow-[var(--glow-sm)]">
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={loading || googleLoading || role === "driver"}
            className="dispatch-field mb-3 flex w-full items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] py-2.5 text-sm font-medium transition-colors hover:border-[var(--color-accent)] disabled:opacity-40"
          >
            <GoogleGlyph className="h-4 w-4 shrink-0" />
            {googleLoading ? "Redirecting…" : "Continue with Google"}
          </button>

          <div className="mb-3 flex items-center gap-2 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            <span className="h-px flex-1 bg-[var(--color-border)]" />
            or email
            <span className="h-px flex-1 bg-[var(--color-border)]" />
          </div>

          <form onSubmit={(e) => void submit(e)} className="space-y-2.5">
            {error ? (
              <p className="rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300">{error}</p>
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
            <input
              type="password"
              required
              minLength={6}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              className="dispatch-field w-full rounded-xl border border-[var(--color-border)] px-3 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={loading || googleLoading}
              className="w-full rounded-xl bg-[var(--color-accent)] py-2.5 text-sm font-bold text-[#05080f] transition-opacity hover:opacity-95 disabled:opacity-50"
            >
              {loading ? "Signing in…" : `Sign in as ${activeRole.label}`}
            </button>
          </form>
        </div>
      </div>
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
