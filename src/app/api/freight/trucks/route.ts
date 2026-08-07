import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { isVerifiedCarrier } from "@/lib/freight/carrier-identity";
import {
  assignTruckToDriver,
  createCarrierTruck,
  deleteCarrierTruck,
  listCarrierTrucks,
  updateCarrierTruck,
} from "@/lib/freight/carrier-trucks";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageDrivers } from "@/lib/tms/permissions";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";

async function resolveActor() {
  const sb = await createClient();
  if (!sb) return null;
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return null;

  const isDisp = await assertDispatcher(user);
  if (isDisp) {
    const role = await resolveTmsRole(user);
    const allowed =
      canManageDrivers(role) || isSuperDispatcherEmail(user.email);
    return {
      userId: user.id,
      as: "dispatcher" as const,
      canWrite: Boolean(allowed),
    };
  }

  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", user.id)
    .maybeSingle();
  if (isVerifiedCarrier(profile)) {
    return { userId: user.id, as: "carrier" as const, canWrite: true };
  }
  return null;
}

async function assertDriverBelongsToCarrier(
  driverProfileId: string,
  carrierProfileId: string,
): Promise<boolean> {
  const admin = getServiceRoleClient();
  if (!admin) return false;
  const { data } = await admin
    .from("profiles")
    .select("id, role, carrier_id")
    .eq("id", driverProfileId)
    .maybeSingle();
  return Boolean(
    data &&
      data.role === "driver" &&
      (data.carrier_id as string) === carrierProfileId,
  );
}

async function resolveCarrierScope(
  actor: NonNullable<Awaited<ReturnType<typeof resolveActor>>>,
  carrierProfileId?: string | null,
): Promise<{ carrierId: string } | { error: string; status: number }> {
  if (actor.as === "carrier") {
    return { carrierId: actor.userId };
  }
  if (!carrierProfileId) {
    return { error: "carrierProfileId required", status: 400 };
  }
  return { carrierId: carrierProfileId };
}

/** GET — list trucks for carrier (own) or dispatcher (?carrierProfileId=) */
export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-trucks-get", 60)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const carrierProfileId = req.nextUrl.searchParams.get("carrierProfileId");
  const scope = await resolveCarrierScope(actor, carrierProfileId);
  if ("error" in scope) {
    return NextResponse.json({ error: scope.error }, { status: scope.status });
  }

  const trucks = await listCarrierTrucks(scope.carrierId);
  const admin = getServiceRoleClient();
  const driverIds = trucks
    .map((t) => t.assigned_driver_profile_id)
    .filter(Boolean) as string[];
  const driverNames = new Map<string, string>();
  if (admin && driverIds.length) {
    const { data } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", driverIds);
    for (const d of data ?? []) {
      driverNames.set(d.id as string, (d.full_name as string) || "Driver");
    }
  }

  return NextResponse.json({
    trucks: trucks.map((t) => ({
      ...t,
      driver_name: t.assigned_driver_profile_id
        ? driverNames.get(t.assigned_driver_profile_id) || "Driver"
        : null,
    })),
  });
}

const postSchema = z.object({
  carrierProfileId: z.string().uuid().optional(),
  truckNumber: z.string().min(1).max(40),
  equipment: z.string().max(80).optional(),
  trailerNumber: z.string().max(40).optional(),
  assignedDriverProfileId: z.string().uuid().nullable().optional(),
  status: z.string().max(40).optional(),
  notes: z.string().max(200).optional(),
  truckType: z.string().max(60).optional(),
  vin: z.string().max(32).optional(),
  licensePlate: z.string().max(20).optional(),
  homeBase: z.string().max(80).optional(),
  /** Shortcut: assign truck # to driver (creates truck if needed) */
  assignToDriverProfileId: z.string().uuid().optional(),
});

/** POST — create truck, or assign truck number to a driver */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-trucks-post", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const scope = await resolveCarrierScope(actor, body.carrierProfileId);
    if ("error" in scope) {
      return NextResponse.json({ error: scope.error }, { status: scope.status });
    }

    if (body.assignToDriverProfileId) {
      const ok = await assertDriverBelongsToCarrier(
        body.assignToDriverProfileId,
        scope.carrierId,
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Driver is not on this carrier" },
          { status: 400 },
        );
      }
      const result = await assignTruckToDriver({
        carrierProfileId: scope.carrierId,
        driverProfileId: body.assignToDriverProfileId,
        truckNumber: body.truckNumber,
        equipment: body.equipment,
      });
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, truck: result.truck });
    }

    if (body.assignedDriverProfileId) {
      const ok = await assertDriverBelongsToCarrier(
        body.assignedDriverProfileId,
        scope.carrierId,
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Driver is not on this carrier" },
          { status: 400 },
        );
      }
    }

    const result = await createCarrierTruck({
      carrierProfileId: scope.carrierId,
      truckNumber: body.truckNumber,
      equipment: body.equipment,
      trailerNumber: body.trailerNumber,
      assignedDriverProfileId: body.assignedDriverProfileId,
      status: body.status,
      notes: body.notes,
      truckType: body.truckType,
      vin: body.vin,
      licensePlate: body.licensePlate,
      homeBase: body.homeBase,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, truck: result.truck });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const patchSchema = z.object({
  truckId: z.string().uuid(),
  carrierProfileId: z.string().uuid().optional(),
  truckNumber: z.string().min(1).max(40).optional(),
  equipment: z.string().max(80).optional(),
  trailerNumber: z.string().max(40).nullable().optional(),
  assignedDriverProfileId: z.string().uuid().nullable().optional(),
  status: z.string().max(40).optional(),
  notes: z.string().max(200).nullable().optional(),
});

/** PATCH — update truck / assign or unassign driver */
export async function PATCH(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-trucks-patch", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const { data: existing } = await admin
      .from("carrier_trucks")
      .select("id, carrier_profile_id")
      .eq("id", body.truckId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: "Truck not found" }, { status: 404 });
    }

    if (
      actor.as === "carrier" &&
      (existing.carrier_profile_id as string) !== actor.userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (body.assignedDriverProfileId) {
      const ok = await assertDriverBelongsToCarrier(
        body.assignedDriverProfileId,
        existing.carrier_profile_id as string,
      );
      if (!ok) {
        return NextResponse.json(
          { error: "Driver is not on this carrier" },
          { status: 400 },
        );
      }
    }

    const result = await updateCarrierTruck({
      truckId: body.truckId,
      truckNumber: body.truckNumber,
      equipment: body.equipment,
      trailerNumber: body.trailerNumber,
      assignedDriverProfileId: body.assignedDriverProfileId,
      status: body.status,
      notes: body.notes,
    });
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json({ ok: true, truck: result.truck });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** DELETE — remove truck (?truckId=) */
export async function DELETE(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-trucks-delete", 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const actor = await resolveActor();
  if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!actor.canWrite) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const truckId = req.nextUrl.searchParams.get("truckId");
  if (!truckId) {
    return NextResponse.json({ error: "truckId required" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  const { data: existing } = await admin
    .from("carrier_trucks")
    .select("id, carrier_profile_id")
    .eq("id", truckId)
    .maybeSingle();
  if (!existing) {
    return NextResponse.json({ error: "Truck not found" }, { status: 404 });
  }
  if (
    actor.as === "carrier" &&
    (existing.carrier_profile_id as string) !== actor.userId
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await deleteCarrierTruck(truckId);
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
