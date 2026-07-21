import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  canAccessDispatcherPortal,
  ensureDispatcherTmsUser,
  resolveTmsRole,
  syncSubDispatcherProfile,
} from "@/lib/tms/auth";
import { resolveLoginDestination } from "@/lib/tms/resolve-destination";
import { isDispatcherRole } from "@/lib/tms/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function safeNextPath(raw: string | null | undefined): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

function readCookie(request: NextRequest, name: string): string | null {
  const raw = request.cookies.get(name)?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function loginError(origin: string, reason: string, cookies: CookieToSet[] = []) {
  const res = NextResponse.redirect(
    `${origin}/login?error=auth&reason=${encodeURIComponent(reason)}`,
  );
  for (const c of cookies) {
    res.cookies.set(c.name, c.value, c.options);
  }
  // Clear oauth hint cookies
  res.cookies.set("tms_oauth_next", "", { path: "/", maxAge: 0 });
  res.cookies.set("tms_oauth_role", "", { path: "/", maxAge: 0 });
  return res;
}

/**
 * Server-side OAuth callback — exchanges PKCE using the code verifier cookie
 * set by createBrowserClient. Avoids client Strict Mode / storage races.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthDesc = url.searchParams.get("error_description");

  const nextHint =
    safeNextPath(url.searchParams.get("next")) ||
    safeNextPath(readCookie(request, "tms_oauth_next"));
  const intendedRole =
    url.searchParams.get("role") || readCookie(request, "tms_oauth_role");

  if (oauthError) {
    return loginError(origin, oauthDesc || oauthError);
  }
  if (!code) {
    return loginError(origin, "missing_code");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!supabaseUrl || !anon) {
    return loginError(origin, "missing_supabase_env");
  }

  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          cookiesToSet.push({ name, value, options });
        });
      },
    },
  });

  const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) {
    return loginError(origin, exchangeError.message, cookiesToSet);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return loginError(origin, "session_missing_after_exchange", cookiesToSet);
  }

  if (intendedRole === "dispatcher") {
    const tmsRole = await resolveTmsRole(user);
    if (tmsRole && isDispatcherRole(tmsRole) && (await canAccessDispatcherPortal(user))) {
      const emailNorm = user.email?.trim().toLowerCase() ?? "";
      if (emailNorm) {
        await ensureDispatcherTmsUser({
          userId: user.id,
          email: emailNorm,
          superDispatcher: tmsRole === "super_dispatcher",
        });
        await syncSubDispatcherProfile(user.id, emailNorm);
      }
    }
  }

  const resolved = await resolveLoginDestination(user);
  if (resolved.path === "/login" && resolved.error) {
    return loginError(origin, resolved.error, cookiesToSet);
  }

  let dest = resolved.path;
  if (nextHint === "/carrier/register" && resolved.path.startsWith("/carrier")) {
    dest = nextHint;
  } else if (
    nextHint &&
    ((dest.startsWith("/dispatcher") && nextHint.startsWith("/dispatcher")) ||
      (dest.startsWith("/carrier") && nextHint.startsWith("/carrier")) ||
      (dest.startsWith("/driver") && nextHint.startsWith("/driver")))
  ) {
    dest = nextHint;
  }

  const response = NextResponse.redirect(`${origin}${dest}`);
  for (const c of cookiesToSet) {
    response.cookies.set(c.name, c.value, c.options);
  }
  response.cookies.set("tms_oauth_next", "", { path: "/", maxAge: 0 });
  response.cookies.set("tms_oauth_role", "", { path: "/", maxAge: 0 });
  return response;
}
