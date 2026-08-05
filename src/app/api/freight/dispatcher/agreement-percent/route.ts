import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import { lookupDefaultDispatchPercentByCompany } from "@/lib/freight/carrier-agreements";
import { createClient } from "@/lib/supabase/server";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

/** GET ?company= — default dispatch % from accepted agreement */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "agreement-percent", 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const company = sanitizeText(req.nextUrl.searchParams.get("company") ?? "", 200);
  if (!company) {
    return NextResponse.json({ dispatchPercent: null });
  }

  const percent = await lookupDefaultDispatchPercentByCompany(company);
  return NextResponse.json({ dispatchPercent: percent });
}
