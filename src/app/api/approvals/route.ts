import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await db
    .from("tms_load_approvals")
    .select("*, tms_loads(load_number, origin_city, origin_state, destination_city, destination_state)")
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ approvals: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id, decision, note } = (await req.json()) as {
    id: string;
    decision: "approved" | "rejected";
    note?: string;
  };

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: approval, error: fetchErr } = await db
    .from("tms_load_approvals")
    .select("*")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();

  if (fetchErr || !approval) {
    return NextResponse.json({ error: "Approval not found" }, { status: 404 });
  }

  if (decision === "approved") {
    if (approval.action === "create" && approval.load_id) {
      await db
        .from("tms_loads")
        .update({ status: "available", approved_by: user.id })
        .eq("id", approval.load_id);
    } else if (approval.action === "edit" && approval.load_id) {
      await db
        .from("tms_loads")
        .update({ ...approval.payload, approved_by: user.id })
        .eq("id", approval.load_id);
    } else if (approval.action === "cancel" && approval.load_id) {
      await db
        .from("tms_loads")
        .update({ status: "cancelled", approved_by: user.id })
        .eq("id", approval.load_id);
    }
  } else if (approval.action === "create" && approval.load_id) {
    await db.from("tms_loads").delete().eq("id", approval.load_id);
  }

  const { error: updateErr } = await db
    .from("tms_load_approvals")
    .update({
      status: decision,
      reviewed_by: user.id,
      review_note: note ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
