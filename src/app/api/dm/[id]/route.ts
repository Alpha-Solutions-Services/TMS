import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const patchSchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const service = getServiceRoleClient();
  const supabase = admin && service ? service : await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data: row, error: fetchErr } = await supabase
    .from("dm_messages")
    .select("id, sender_id, is_admin, deleted_at")
    .eq("id", params.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canEdit =
    row.sender_id === session.user.id ||
    (admin && row.is_admin === true);
  if (!canEdit || row.deleted_at) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("dm_messages")
    .update({
      body: parsed.body.trim(),
      edited_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const admin = isAdminUser(session.user);
  const service = getServiceRoleClient();
  const supabase = admin && service ? service : await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data: row } = await supabase
    .from("dm_messages")
    .select("id, sender_id, is_admin")
    .eq("id", params.id)
    .maybeSingle();

  if (!row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const canDelete =
    row.sender_id === session.user.id ||
    (admin && row.is_admin === true);
  if (!canDelete) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { error } = await supabase
    .from("dm_messages")
    .update({
      deleted_at: new Date().toISOString(),
      body: "",
    })
    .eq("id", params.id);

  if (error) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
