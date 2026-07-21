import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveLoginDestination } from "@/lib/tms/resolve-destination";

export const dynamic = "force-dynamic";

/**
 * Resolves post-login destination from the real profile (service role),
 * so OAuth / RLS timing cannot send users to the wrong portal.
 */
export async function GET() {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Auth unavailable", path: "/login" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized", path: "/login" }, { status: 401 });
  }

  const resolved = await resolveLoginDestination(user);
  const status = resolved.path === "/login" && resolved.error ? 403 : 200;
  return NextResponse.json(resolved, { status });
}
