import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const patchSchema = z.object({
  status: z.enum(["new", "contacted", "closed"]).optional(),
  admin_notes: z.string().max(5000).nullable().optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (body.status !== undefined) updates.status = body.status;
  if (body.admin_notes !== undefined) updates.admin_notes = body.admin_notes;
  if (body.status !== undefined && body.status !== "new") {
    updates.read_at = new Date().toISOString();
  }

  const { data, error } = await db
    .from("contact_inquiries")
    .update(updates)
    .eq("id", params.id)
    .select("*")
    .single();

  if (error) {
    console.error("[admin/inquiries/patch]", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ inquiry: data });
}
