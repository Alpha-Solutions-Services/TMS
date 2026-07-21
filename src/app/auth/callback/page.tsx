"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function safeNextPath(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

async function resolveDestination(): Promise<{ path: string; error?: string } | null> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const destRes = await fetch("/api/auth/resolve-destination", {
      credentials: "include",
      cache: "no-store",
    });
    const destBody = (await destRes.json().catch(() => ({}))) as {
      path?: string;
      error?: string;
    };
    if (destRes.ok && destBody.path && destBody.path !== "/login") {
      return { path: destBody.path };
    }
    if (destRes.status === 401 && attempt < 3) {
      await new Promise((r) => setTimeout(r, 250 * (attempt + 1)));
      continue;
    }
    if (destBody.path === "/carrier/register") return { path: destBody.path };
    if (destBody.error) return { path: "/login", error: destBody.error };
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
      // Clear any stale Portal/TMS service workers that can trap /login.
      try {
        if ("serviceWorker" in navigator) {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if (window.caches) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
        }
      } catch {
        /* ignore */
      }

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

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          window.location.replace(
            `/login?error=auth&reason=${encodeURIComponent(error.message)}`,
          );
          return;
        }
      } else {
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          window.location.replace("/login?error=auth&reason=missing_code");
          return;
        }
      }

      // Always route from the real account type — never trust the role toggle alone.
      const resolved = await resolveDestination();
      if (cancelled) return;

      if (!resolved || (resolved.path === "/login" && resolved.error)) {
        window.location.replace(
          `/login?error=auth&reason=${encodeURIComponent(resolved?.error ?? "no_portal_access")}`,
        );
        return;
      }

      // Only provision dispatcher when the account actually belongs on dispatcher routes.
      if (
        freight === "1" &&
        intendedRole === "dispatcher" &&
        resolved.path.startsWith("/dispatcher")
      ) {
        const ensureRes = await fetch("/api/dispatcher/ensure-profile", {
          method: "POST",
          credentials: "include",
        });
        if (!ensureRes.ok) {
          const body = (await ensureRes.json().catch(() => ({}))) as { error?: string };
          // Do not sign out — resolve already confirmed dispatcher access; retry landing.
          console.warn("[auth/callback] ensure-profile:", body.error);
        }
      }

      if (cancelled) return;
      setMessage("Success — redirecting…");
      const dest =
        next &&
        ((resolved.path.startsWith("/dispatcher") && next.startsWith("/dispatcher")) ||
          (resolved.path.startsWith("/carrier") && next.startsWith("/carrier")) ||
          (resolved.path.startsWith("/driver") && next.startsWith("/driver")))
          ? next
          : resolved.path;
      window.location.replace(dest);
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
