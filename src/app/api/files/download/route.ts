import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const owns = path.startsWith(`${session.user.id}/`);
  if (!admin && !owns) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = getServiceRoleClient();
  const db = service || (await createClient());
  if (!db) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data, error } = await db.storage
    .from("portal-files")
    .createSignedUrl(path, 120);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
