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

function readHintCookie(request: NextRequest, name: string): string | null {
  const raw = request.cookies.get(name)?.value;
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function applyCookies(res: NextResponse, cookies: CookieToSet[]) {
  for (const c of cookies) {
    res.cookies.set(c.name, c.value, c.options);
  }
  res.cookies.set("tms_oauth_next", "", { path: "/", maxAge: 0 });
  res.cookies.set("tms_oauth_role", "", { path: "/", maxAge: 0 });
  return res;
}

function loginError(origin: string, reason: string, cookies: CookieToSet[] = []) {
  return applyCookies(
    NextResponse.redirect(
      `${origin}/login?error=auth&reason=${encodeURIComponent(reason)}`,
    ),
    cookies,
  );
}

/**
 * Server OAuth callback — PKCE verifier is in cookies set by createBrowserClient.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthDesc = url.searchParams.get("error_description");

  const nextHint =
    safeNextPath(url.searchParams.get("next")) ||
    safeNextPath(readHintCookie(request, "tms_oauth_next"));
  const intendedRole =
    url.searchParams.get("role") || readHintCookie(request, "tms_oauth_role");

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

  // Debug aid: if verifier cookie is missing, surface a clearer reason.
  const hasVerifier = request.cookies
    .getAll()
    .some((c) => /code-verifier|code_verifier/i.test(c.name));
  if (!hasVerifier) {
    return loginError(
      origin,
      "pkce_cookie_missing — clear site cookies for tms.alphasolutions.software, then try Continue with Google again (same browser tab).",
    );
  }

  const cookiesToSet: CookieToSet[] = [];

  const supabase = createServerClient(supabaseUrl, anon, {
    cookieEncoding: "base64url",
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

  // Provision dispatcher when the account is on the dispatch team.
  const tmsRole = await resolveTmsRole(user);
  if (
    (intendedRole === "dispatcher" || isDispatcherRole(tmsRole)) &&
    tmsRole &&
    isDispatcherRole(tmsRole) &&
    (await canAccessDispatcherPortal(user))
  ) {
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

  const { deliverAuthNotifications } = await import("@/lib/email/auth-notify");
  void deliverAuthNotifications({
    kind: "login",
    email: user.email?.trim().toLowerCase() || "unknown",
    userId: user.id,
    profileRole: tmsRole || intendedRole || "unknown",
    detail: "OAuth / Google sign-in",
  }).catch(() => {});

  return applyCookies(NextResponse.redirect(`${origin}${dest}`), cookiesToSet);
}
