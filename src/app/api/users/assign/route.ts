import { NextResponse } from "next/server";
import { z } from "zod";
import { logFreightAction } from "@/lib/freight/audit-log";
import { sendTeamAssignmentEmail } from "@/lib/freight/emails";
import { tmsLoginUrl } from "@/lib/tms/dispatcher-assignments";
import {
  inviteRoleLabel,
  type InviteTeamRole,
} from "@/lib/tms/permissions";
import { requireSuperDispatcher } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const schema = z.object({
  dispatcherUserId: z.string().uuid(),
  assigneeType: z.enum(["carrier", "driver"]),
  assigneeId: z.string().uuid(),
});

export async function POST(req: Request) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: dispatcher } = await db
    .from("tms_users")
    .select("id, email, full_name, role, active")
    .eq("id", body.dispatcherUserId)
    .maybeSingle();

  if (
    !dispatcher?.active ||
    (dispatcher.role !== "dispatcher" && dispatcher.role !== "sub_dispatcher")
  ) {
    return NextResponse.json({ error: "Dispatcher team member not found" }, { status: 404 });
  }

  let assigneeName = "";
  if (body.assigneeType === "carrier") {
    const { data: carrier } = await db
      .from("profiles")
      .select("id, company_name, full_name, role")
      .eq("id", body.assigneeId)
      .eq("role", "carrier")
      .maybeSingle();
    if (!carrier) {
      return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
    }
    assigneeName = (carrier.company_name as string) || (carrier.full_name as string) || "Carrier";
    const { error } = await db
      .from("profiles")
      .update({ assigned_dispatcher_id: body.dispatcherUserId })
      .eq("id", body.assigneeId);
    if (error) {
      return NextResponse.json({ error: "Could not assign carrier" }, { status: 500 });
    }
  } else {
    const { data: driver } = await db
      .from("dispatch_driver_roster")
      .select("id, driver_name, active")
      .eq("id", body.assigneeId)
      .maybeSingle();
    if (!driver || driver.active === false) {
      return NextResponse.json({ error: "Driver not found" }, { status: 404 });
    }
    assigneeName = driver.driver_name as string;
    const { error } = await db
      .from("dispatch_driver_roster")
      .update({ assigned_dispatcher_id: body.dispatcherUserId })
      .eq("id", body.assigneeId);
    if (error) {
      return NextResponse.json({ error: "Could not assign driver" }, { status: 500 });
    }
  }

  const roleLabel = inviteRoleLabel(dispatcher.role as InviteTeamRole);
  const emailResult = await sendTeamAssignmentEmail({
    to: dispatcher.email as string,
    dispatcherName: (dispatcher.full_name as string) || dispatcher.email,
    roleLabel,
    assigneeType: body.assigneeType,
    assigneeName,
    loginUrl: tmsLoginUrl(),
  });

  await logFreightAction({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "team.assign",
    entityType: body.assigneeType,
    entityId: body.assigneeId,
    meta: {
      assignedTo: body.dispatcherUserId,
      assigneeName,
    },
  });

  return NextResponse.json({
    ok: true,
    emailSent: emailResult.ok,
    emailError: emailResult.ok ? undefined : emailResult.error,
  });
}

export async function GET() {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ carriers: [], drivers: [] });

  const { data: carriers } = await db
    .from("profiles")
    .select("id, company_name, full_name, assigned_dispatcher_id")
    .eq("role", "carrier")
    .order("company_name");

  const { data: drivers } = await db
    .from("dispatch_driver_roster")
    .select("id, driver_name, carrier_company_name, assigned_dispatcher_id")
    .eq("active", true)
    .order("driver_name");

  return NextResponse.json({
    carriers: carriers ?? [],
    drivers: drivers ?? [],
  });
}
