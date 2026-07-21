import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const admin = isAdminUser(session.user);
  const service = getServiceRoleClient();
  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const db = admin && service ? service : supabase;
  let q = db.from("portal_files").select("*").eq("id", params.id);
  if (!admin) q = q.eq("user_id", session.user.id);
  const { data: row } = await q.maybeSingle();
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (service) {
    await service.storage
      .from("portal-files")
      .remove([row.storage_path as string]);
    await service.from("portal_files").delete().eq("id", params.id);
  } else {
    await supabase.from("portal_files").delete().eq("id", params.id);
  }

  return NextResponse.json({ ok: true });
}
