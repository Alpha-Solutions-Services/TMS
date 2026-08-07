import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeText } from "./api-security";

export type CarrierTruckRow = {
  id: string;
  carrier_profile_id: string;
  truck_number: string;
  equipment: string | null;
  trailer_number: string | null;
  assigned_driver_profile_id: string | null;
  status: string;
  notes: string | null;
  truck_type?: string | null;
  vin?: string | null;
  license_plate?: string | null;
  home_base?: string | null;
  created_at?: string;
  updated_at?: string;
};

export async function listCarrierTrucks(
  carrierProfileId: string,
): Promise<CarrierTruckRow[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];
  const { data, error } = await admin
    .from("carrier_trucks")
    .select("*")
    .eq("carrier_profile_id", carrierProfileId)
    .order("truck_number", { ascending: true });
  if (error) {
    console.warn("[carrier-trucks] list:", error.message);
    return [];
  }
  return (data ?? []) as CarrierTruckRow[];
}

export async function createCarrierTruck(opts: {
  carrierProfileId: string;
  truckNumber: string;
  equipment?: string;
  trailerNumber?: string;
  assignedDriverProfileId?: string | null;
  status?: string;
  notes?: string;
  truckType?: string;
  vin?: string;
  licensePlate?: string;
  homeBase?: string;
}): Promise<{ truck?: CarrierTruckRow; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const truckNumber = sanitizeText(opts.truckNumber, 40).trim();
  if (!truckNumber) return { error: "Truck number required" };

  if (opts.assignedDriverProfileId) {
    await clearDriverAssignment(opts.assignedDriverProfileId);
  }

  const { data, error } = await admin
    .from("carrier_trucks")
    .insert({
      carrier_profile_id: opts.carrierProfileId,
      truck_number: truckNumber,
      equipment: opts.equipment ? sanitizeText(opts.equipment, 80) : "Dry Van",
      trailer_number: opts.trailerNumber
        ? sanitizeText(opts.trailerNumber, 40)
        : null,
      assigned_driver_profile_id: opts.assignedDriverProfileId || null,
      status: opts.status ? sanitizeText(opts.status, 40) : "Available",
      notes: opts.notes ? sanitizeText(opts.notes, 200) : null,
      truck_type: opts.truckType ? sanitizeText(opts.truckType, 60) : "Dry Van",
      vin: opts.vin ? sanitizeText(opts.vin, 32) : null,
      license_plate: opts.licensePlate ? sanitizeText(opts.licensePlate, 20) : null,
      home_base: opts.homeBase ? sanitizeText(opts.homeBase, 80) : null,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { truck: data as CarrierTruckRow };
}

async function clearDriverAssignment(driverProfileId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return;
  await admin
    .from("carrier_trucks")
    .update({
      assigned_driver_profile_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("assigned_driver_profile_id", driverProfileId);
}

export async function updateCarrierTruck(opts: {
  truckId: string;
  truckNumber?: string;
  equipment?: string;
  trailerNumber?: string | null;
  assignedDriverProfileId?: string | null;
  status?: string;
  notes?: string | null;
  truckType?: string | null;
  vin?: string | null;
  licensePlate?: string | null;
  homeBase?: string | null;
}): Promise<{ truck?: CarrierTruckRow; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (opts.truckNumber !== undefined) {
    const n = sanitizeText(opts.truckNumber, 40).trim();
    if (!n) return { error: "Truck number required" };
    patch.truck_number = n;
  }
  if (opts.equipment !== undefined) {
    patch.equipment = sanitizeText(opts.equipment, 80);
  }
  if (opts.trailerNumber !== undefined) {
    patch.trailer_number = opts.trailerNumber
      ? sanitizeText(opts.trailerNumber, 40)
      : null;
  }
  if (opts.status !== undefined) {
    patch.status = sanitizeText(opts.status, 40);
  }
  if (opts.notes !== undefined) {
    patch.notes = opts.notes ? sanitizeText(opts.notes, 200) : null;
  }
  if (opts.truckType !== undefined) {
    patch.truck_type = opts.truckType ? sanitizeText(opts.truckType, 60) : null;
  }
  if (opts.vin !== undefined) {
    patch.vin = opts.vin ? sanitizeText(opts.vin, 32) : null;
  }
  if (opts.licensePlate !== undefined) {
    patch.license_plate = opts.licensePlate
      ? sanitizeText(opts.licensePlate, 20)
      : null;
  }
  if (opts.homeBase !== undefined) {
    patch.home_base = opts.homeBase ? sanitizeText(opts.homeBase, 80) : null;
  }
  if (opts.assignedDriverProfileId !== undefined) {
    if (opts.assignedDriverProfileId) {
      await clearDriverAssignment(opts.assignedDriverProfileId);
    }
    patch.assigned_driver_profile_id = opts.assignedDriverProfileId;
    if (opts.assignedDriverProfileId && opts.status === undefined) {
      patch.status = "Assigned";
    }
    if (opts.assignedDriverProfileId === null && opts.status === undefined) {
      patch.status = "Available";
    }
  }

  const { data, error } = await admin
    .from("carrier_trucks")
    .update(patch)
    .eq("id", opts.truckId)
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { truck: data as CarrierTruckRow };
}

export async function deleteCarrierTruck(
  truckId: string,
): Promise<{ ok?: true; error?: string }> {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };
  const { error } = await admin.from("carrier_trucks").delete().eq("id", truckId);
  if (error) return { error: error.message };
  return { ok: true };
}

/** Assign (or create) a truck number to a driver under a carrier. */
export async function assignTruckToDriver(opts: {
  carrierProfileId: string;
  driverProfileId: string;
  truckNumber: string;
  equipment?: string;
}): Promise<{ truck?: CarrierTruckRow; error?: string }> {
  const truckNumber = sanitizeText(opts.truckNumber, 40).trim();
  if (!truckNumber) return { error: "Truck number required" };

  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" };

  const { data: existing } = await admin
    .from("carrier_trucks")
    .select("*")
    .eq("carrier_profile_id", opts.carrierProfileId)
    .ilike("truck_number", truckNumber)
    .maybeSingle();

  if (existing?.id) {
    return updateCarrierTruck({
      truckId: existing.id as string,
      assignedDriverProfileId: opts.driverProfileId,
      equipment: opts.equipment,
    });
  }

  return createCarrierTruck({
    carrierProfileId: opts.carrierProfileId,
    truckNumber,
    equipment: opts.equipment,
    assignedDriverProfileId: opts.driverProfileId,
    status: "Assigned",
  });
}

export async function trucksForDrivers(
  driverProfileIds: string[],
): Promise<Map<string, CarrierTruckRow>> {
  const map = new Map<string, CarrierTruckRow>();
  if (!driverProfileIds.length) return map;
  const admin = getServiceRoleClient();
  if (!admin) return map;
  const { data } = await admin
    .from("carrier_trucks")
    .select("*")
    .in("assigned_driver_profile_id", driverProfileIds);
  for (const row of (data ?? []) as CarrierTruckRow[]) {
    if (row.assigned_driver_profile_id) {
      map.set(row.assigned_driver_profile_id, row);
    }
  }
  return map;
}
