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

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function safeNextPath(raw: string | null): string | null {
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) return raw;
  return null;
}

function loginError(origin: string, reason: string, cookies: CookieToSet[] = []) {
  const res = NextResponse.redirect(
    `${origin}/login?error=auth&reason=${encodeURIComponent(reason)}`,
  );
  for (const c of cookies) {
    res.cookies.set(c.name, c.value, c.options);
  }
  return res;
}

/**
 * Server-side OAuth callback — exchanges the code and sets auth cookies on the
 * redirect response. Avoids client PKCE / service-worker races on /login.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const origin = url.origin;
  const code = url.searchParams.get("code");
  const oauthError = url.searchParams.get("error");
  const oauthDesc = url.searchParams.get("error_description");
  const freight = url.searchParams.get("freight");
  const intendedRole = url.searchParams.get("role");
  const nextHint = safeNextPath(url.searchParams.get("next"));

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

  // Provision dispatcher team when they explicitly chose Dispatcher on login.
  if (freight === "1" && intendedRole === "dispatcher") {
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
  if (
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
  return response;
}
