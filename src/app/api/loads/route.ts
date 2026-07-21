import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { isSuperDispatcherEmail, resolveTmsRole } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { LoadInput } from "@/lib/tms/loads";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let query = db.from("tms_loads").select("*").order("created_at", { ascending: false });

  if (role === "carrier") {
    const { data: tmsUser } = await db
      .from("tms_users")
      .select("carrier_id")
      .eq("id", user.id)
      .maybeSingle();
    if (!tmsUser?.carrier_id) return NextResponse.json({ loads: [] });
    query = query.eq("carrier_id", tmsUser.carrier_id);
  } else if (role === "driver") {
    const { data: driver } = await db
      .from("tms_drivers")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!driver) return NextResponse.json({ loads: [] });
    query = query.eq("driver_id", driver.id);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ loads: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher" && role !== "sub_dispatcher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as LoadInput;
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const isSuper = role === "super_dispatcher" || isSuperDispatcherEmail(user.email);

  if (isSuper) {
    const { data, error } = await db
      .from("tms_loads")
      .insert({
        ...body,
        status: "available",
        created_by: user.id,
        approved_by: user.id,
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ load: data });
  }

  // Sub dispatcher: create load as pending + approval request
  const { data: load, error: loadErr } = await db
    .from("tms_loads")
    .insert({
      ...body,
      status: "pending_approval",
      created_by: user.id,
    })
    .select()
    .single();
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

  const { error: approvalErr } = await db.from("tms_load_approvals").insert({
    load_id: load.id,
    action: "create",
    payload: body,
    requested_by: user.id,
  });
  if (approvalErr) {
    return NextResponse.json({ error: approvalErr.message }, { status: 500 });
  }

  return NextResponse.json({ load, pendingApproval: true });
}
