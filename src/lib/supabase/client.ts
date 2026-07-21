import { createBrowserClient } from "@supabase/ssr";
import { isPortalAuthConfigured } from "@/lib/supabase/env";

/**
 * Match working Portal client — let @supabase/ssr own document.cookie + PKCE.
 */
export function createClient() {
  if (typeof window === "undefined") return null;
  if (!isPortalAuthConfigured()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;
  return createBrowserClient(url, anon, {
    cookieEncoding: "base64url",
    cookieOptions: {
      path: "/",
      sameSite: "lax",
      secure: window.location.protocol === "https:",
    },
  });
}
