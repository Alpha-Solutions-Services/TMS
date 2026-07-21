"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

function AuthCallbackInner() {
  const searchParams = useSearchParams();
  const [message, setMessage] = useState("Signing you in…");

  useEffect(() => {
    let cancelled = false;

    async function finish() {
      const supabase = createClient();
      if (!supabase) {
        window.location.replace(
          "/login?error=auth&reason=missing_supabase_env"
        );
        return;
      }

      const code = searchParams.get("code");
      const oauthError = searchParams.get("error");
      const oauthDesc = searchParams.get("error_description");
      let next = "/";
      try {
        const stored = sessionStorage.getItem("tms_oauth_next");
        if (stored && stored.startsWith("/") && !stored.startsWith("//")) {
          next = stored;
        }
        sessionStorage.removeItem("tms_oauth_next");
      } catch {
        /* ignore */
      }

      if (oauthError) {
        window.location.replace(
          `/login?error=auth&reason=${encodeURIComponent(oauthDesc || oauthError)}`
        );
        return;
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) {
          window.location.replace(
            `/login?error=auth&reason=${encodeURIComponent(error.message)}`
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

      if (cancelled) return;
      setMessage("Success — redirecting…");
      window.location.replace(next);
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
