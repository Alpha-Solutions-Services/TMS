"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(raw: string | null): string {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return "/";
}

async function resolveDestinationWithRetry(): Promise<string | null> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const destRes = await fetch("/api/auth/resolve-destination", {
      credentials: "include",
      cache: "no-store",
    });
    const destBody = (await destRes.json().catch(() => ({}))) as {
      path?: string;
      role?: string;
      error?: string;
    };
    if (destRes.ok && destBody.path && destBody.path !== "/login") {
      return destBody.path;
    }
    if (destRes.status === 401 && attempt < 2) {
      await new Promise((r) => setTimeout(r, 350 * (attempt + 1)));
      continue;
    }
    if (destBody.path === "/carrier/register") return destBody.path;
    return null;
  }
  return null;
}

function AuthCallbackInner() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const supabase = createClient();
      if (!supabase) {
        window.location.replace("/login?error=auth&reason=missing_supabase_env");
        return;
      }

      const oauthError = searchParams.get("error");
      const oauthDesc = searchParams.get("error_description");
      const code = searchParams.get("code");
      const freight = searchParams.get("freight");
      const roleParam = searchParams.get("role");

      let next = safeNextPath(searchParams.get("next"));
      let intendedRole = roleParam;
      try {
        const stored = sessionStorage.getItem("tms_oauth_next");
        if (stored) next = safeNextPath(stored);
        const storedRole = sessionStorage.getItem("tms_oauth_role");
        if (storedRole) intendedRole = storedRole;
        sessionStorage.removeItem("tms_oauth_next");
        sessionStorage.removeItem("tms_oauth_role");
      } catch {
        /* ignore */
      }

      if (oauthError) {
        window.location.replace(
          `/login?error=auth&reason=${encodeURIComponent(oauthDesc || oauthError)}`,
        );
        return;
      }

      const hash = typeof window !== "undefined" ? window.location.hash.slice(1) : "";
      if (hash) {
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const type = hashParams.get("type");
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) {
            window.location.replace(
              `/login?error=auth&reason=${encodeURIComponent(error.message)}`,
            );
            return;
          }
          if (type === "recovery") {
            window.location.replace("/auth/update-password");
            return;
          }
        }
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          window.location.replace(
            `/login?error=auth&reason=${encodeURIComponent(error.message)}`,
          );
          return;
        }
      } else if (!hash.includes("access_token")) {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?error=auth&reason=missing_code");
          return;
        }
      }

      // Always route from real account type (carrier / driver / dispatcher).
      const resolvedPath = await resolveDestinationWithRetry();
      if (resolvedPath) {
        if (
          freight === "1" &&
          intendedRole === "dispatcher" &&
          resolvedPath.startsWith("/dispatcher")
        ) {
          await fetch("/api/dispatcher/ensure-profile", {
            method: "POST",
            credentials: "include",
          });
        }
        if (cancelled) return;
        setMessage("Success — redirecting…");
        window.location.replace(resolvedPath);
        return;
      }

      if (intendedRole === "carrier") {
        if (cancelled) return;
        window.location.replace("/carrier/register");
        return;
      }

      if (freight === "1" && intendedRole === "dispatcher") {
        const ensureRes = await fetch("/api/dispatcher/ensure-profile", {
          method: "POST",
          credentials: "include",
        });
        if (!ensureRes.ok) {
          const body = (await ensureRes.json().catch(() => ({}))) as { error?: string };
          window.location.replace(
            `/login?error=auth&reason=${encodeURIComponent(body.error ?? "dispatcher_provision_failed")}`,
          );
          return;
        }
        const again = await resolveDestinationWithRetry();
        if (cancelled) return;
        window.location.replace(again ?? "/dispatcher/dashboard");
        return;
      }

      if (cancelled) return;
      setMessage("Success — redirecting…");
      window.location.replace(next.startsWith("/") ? next : "/login");
    }

    void finish();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[var(--color-bg)] px-4">
      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--color-accent)] border-t-transparent" />
      <p className="text-sm text-[var(--color-muted)]">{message}</p>
    </main>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-[var(--color-bg)]">
          <p className="text-sm text-[var(--color-muted)]">Signing you in…</p>
        </main>
      }
    >
      <AuthCallbackInner />
    </Suspense>
  );
}
