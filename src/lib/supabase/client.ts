import { createBrowserClient } from "@supabase/ssr";
import { isPortalAuthConfigured } from "@/lib/supabase/env";

/**
 * Browser Supabase client — PKCE code verifier must live in cookies (not
 * localStorage) so the /auth/callback route can exchange the code on the server.
 */
export function createClient() {
  if (typeof window === "undefined") return null;
  if (!isPortalAuthConfigured()) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) return null;

  return createBrowserClient(url, anon, {
    cookies: {
      getAll() {
        return document.cookie.split(";").map((chunk) => {
          const [name, ...rest] = chunk.trim().split("=");
          return { name, value: rest.join("=") };
        }).filter((c) => c.name);
      },
      setAll(cookiesToSet) {
        const secure = window.location.protocol === "https:" ? "; Secure" : "";
        cookiesToSet.forEach(({ name, value, options }) => {
          const maxAge =
            typeof options?.maxAge === "number" ? `; Max-Age=${options.maxAge}` : "";
          const path = `; Path=${options?.path ?? "/"}`;
          const sameSite = `; SameSite=${options?.sameSite ?? "Lax"}`;
          document.cookie = `${name}=${value}${path}${sameSite}${secure}${maxAge}`;
        });
      },
    },
  });
}
