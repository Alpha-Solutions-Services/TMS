import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { isCarrierIdentity } from "@/lib/freight/carrier-identity";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageDrivers } from "@/lib/tms/permissions";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";

const patchSchema = z.object({
  driverProfileId: z.string().uuid(),
  action: z.enum(["terminate", "suspend", "activate", "set_pay_percent"]),
  payPercent: z.number().min(0).max(100).optional(),
});

async function canManageDriver(
  actorId: string,
  driverProfileId: string,
): Promise<{ ok: true; as: "dispatcher" | "carrier" } | { ok: false }> {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false };

  const sb = await createClient();
  if (!sb) return { ok: false };
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id || user.id !== actorId) return { ok: false };

  if (await assertDispatcher(user)) {
    return { ok: true, as: "dispatcher" };
  }

  const { data: actor } = await admin
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", actorId)
    .maybeSingle();
  if (!actor || !isCarrierIdentity(actor)) return { ok: false };

  const { data: driver } = await admin
    .from("profiles")
    .select("role, carrier_id")
    .eq("id", driverProfileId)
    .maybeSingle();
  if (!driver || driver.role !== "driver" || driver.carrier_id !== actorId) {
    return { ok: false };
  }
  return { ok: true, as: "carrier" };
}

/** PATCH — terminate/suspend/activate driver or set default pay % */
export async function PATCH(req: NextRequest) {
  if (!checkRateLimit(req, "manage-driver", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = patchSchema.parse(await req.json());
    const access = await canManageDriver(user.id, body.driverProfileId);
    if (!access.ok) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Super + full dispatcher may terminate / suspend / revive any driver.
    // Carriers only manage their own (checked above). Sub-dispatchers cannot.
    if (access.as === "dispatcher") {
      const role = await resolveTmsRole(user);
      const allowed =
        canManageDrivers(role) || isSuperDispatcherEmail(user.email);
      if (!allowed) {
        return NextResponse.json(
          { error: "Dispatcher or super dispatcher required" },
          { status: 403 },
        );
      }
    }

    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    if (body.action === "set_pay_percent") {
      if (body.payPercent == null) {
        return NextResponse.json({ error: "payPercent required" }, { status: 400 });
      }
      const { error } = await admin
        .from("profiles")
        .update({
          default_driver_pay_percent: body.payPercent,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.driverProfileId)
        .eq("role", "driver");
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true, payPercent: body.payPercent });
    }

    const status =
      body.action === "terminate"
        ? "terminated"
        : body.action === "suspend"
          ? "suspended"
          : "active";

    const { error } = await admin
      .from("profiles")
      .update({
        driver_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq("id", body.driverProfileId)
      .eq("role", "driver");

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Soft-deactivate matching roster rows when terminated; revive when activated
    const { data: driver } = await admin
      .from("profiles")
      .select("email")
      .eq("id", body.driverProfileId)
      .maybeSingle();
    const email = (driver?.email as string)?.trim().toLowerCase();
    if (email) {
      if (status === "terminated") {
        await admin
          .from("dispatch_driver_roster")
          .update({ active: false })
          .ilike("driver_email", email);
      }
      if (status === "active") {
        await admin
          .from("dispatch_driver_roster")
          .update({ active: true })
          .ilike("driver_email", email);
      }
    }

    return NextResponse.json({ ok: true, driverStatus: status });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[manage-driver]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
