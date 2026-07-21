import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

type Params = { params: { id: string } };

export async function PATCH(req: Request, { params }: Params) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher" && role !== "sub_dispatcher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  if (role === "super_dispatcher") {
    const { data, error } = await db
      .from("tms_loads")
      .update({ ...body, approved_by: user.id })
      .eq("id", params.id)
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ load: data });
  }

  // Sub dispatcher: queue edit for approval
  const { error } = await db.from("tms_load_approvals").insert({
    load_id: params.id,
    action: "edit",
    payload: body,
    requested_by: user.id,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ pendingApproval: true });
}
