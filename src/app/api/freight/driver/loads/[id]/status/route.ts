import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

type Ctx = { params: { id: string } };

const schema = z.object({
  status: z.enum(["Delivered", "In Transit"]),
});

function isDeliveredStatus(s: string) {
  const v = s.toLowerCase();
  return v.includes("deliver") || v === "completed" || v === "complete" || v === "paid";
}

/** PATCH — driver marks own assigned load delivered (or back in transit). */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "driver-load-status", 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("role, driver_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "driver") {
    return NextResponse.json({ error: "Driver only" }, { status: 403 });
  }
  if (profile.driver_status === "terminated" || profile.driver_status === "suspended") {
    return NextResponse.json({ error: "Driver account inactive" }, { status: 403 });
  }

  const loadId = ctx.params.id?.trim();
  if (!loadId) return NextResponse.json({ error: "load id required" }, { status: 400 });

  try {
    const body = schema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const { data: load } = await admin
      .from("dispatch_loads")
      .select("id, assigned_driver_profile_id, status, pod_path")
      .eq("id", loadId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!load || load.assigned_driver_profile_id !== user.id) {
      return NextResponse.json({ error: "Load not found" }, { status: 404 });
    }

    if (body.status === "Delivered" && isDeliveredStatus(String(load.status || ""))) {
      return NextResponse.json({ ok: true, status: load.status });
    }

    const { error } = await admin
      .from("dispatch_loads")
      .update({
        status: body.status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", loadId)
      .eq("assigned_driver_profile_id", user.id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, status: body.status });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
