import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type AdvanceRequest = {
  id: string;
  load_id: string | null;
  carrier_profile_id: string;
  request_type: "lumper" | "advance";
  amount: number;
  status: string;
  carrier_note: string | null;
  dispatcher_note: string | null;
  created_at: string;
  decided_at: string | null;
  load_number?: string | null;
  carrier_name?: string | null;
};

export async function listAdvancesForCarrier(carrierProfileId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return [] as AdvanceRequest[];
  const { data } = await admin
    .from("tms_advance_requests")
    .select(
      "id, load_id, carrier_profile_id, request_type, amount, status, carrier_note, dispatcher_note, created_at, decided_at",
    )
    .eq("carrier_profile_id", carrierProfileId)
    .order("created_at", { ascending: false })
    .limit(50);
  return ((data ?? []) as AdvanceRequest[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));
}

export async function createAdvanceRequest(params: {
  carrierProfileId: string;
  requestType: "lumper" | "advance";
  amount: number;
  loadId?: string | null;
  carrierNote?: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };
  if (!(params.amount > 0)) return { error: "Amount must be > 0" as const };

  const { data, error } = await admin
    .from("tms_advance_requests")
    .insert({
      carrier_profile_id: params.carrierProfileId,
      request_type: params.requestType,
      amount: params.amount,
      load_id: params.loadId || null,
      carrier_note: params.carrierNote?.trim() || null,
      status: "pending",
    })
    .select(
      "id, load_id, carrier_profile_id, request_type, amount, status, carrier_note, dispatcher_note, created_at, decided_at",
    )
    .single();

  if (error || !data) return { error: error?.message ?? "Insert failed" };
  return {
    row: { ...(data as AdvanceRequest), amount: Number(data.amount) },
  };
}

export async function listAllAdvances(status?: string) {
  const admin = getServiceRoleClient();
  if (!admin) return [] as AdvanceRequest[];

  let q = admin
    .from("tms_advance_requests")
    .select(
      "id, load_id, carrier_profile_id, request_type, amount, status, carrier_note, dispatcher_note, created_at, decided_at",
    )
    .order("created_at", { ascending: false })
    .limit(80);

  if (status) q = q.eq("status", status);

  const { data } = await q;
  const rows = ((data ?? []) as AdvanceRequest[]).map((r) => ({
    ...r,
    amount: Number(r.amount),
  }));

  const carrierIds = Array.from(new Set(rows.map((r) => r.carrier_profile_id)));
  const loadIds = Array.from(
    new Set(rows.map((r) => r.load_id).filter(Boolean) as string[]),
  );

  const names = new Map<string, string>();
  const loads = new Map<string, string>();

  if (carrierIds.length) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, company_name, full_name")
      .in("id", carrierIds);
    for (const p of profiles ?? []) {
      names.set(
        p.id as string,
        (p.company_name as string) || (p.full_name as string) || "Carrier",
      );
    }
  }
  if (loadIds.length) {
    const { data: loadRows } = await admin
      .from("dispatch_loads")
      .select("id, load_number")
      .in("id", loadIds);
    for (const l of loadRows ?? []) {
      loads.set(l.id as string, String(l.load_number || ""));
    }
  }

  return rows.map((r) => ({
    ...r,
    carrier_name: names.get(r.carrier_profile_id) || "Carrier",
    load_number: r.load_id ? loads.get(r.load_id) || null : null,
  }));
}

export async function decideAdvanceRequest(params: {
  id: string;
  status: "approved" | "denied" | "paid";
  dispatcherNote?: string;
  decidedBy: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return { error: "DB unavailable" as const };

  const { error } = await admin
    .from("tms_advance_requests")
    .update({
      status: params.status,
      dispatcher_note: params.dispatcherNote?.trim() || null,
      decided_by: params.decidedBy,
      decided_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", params.id);

  if (error) return { error: error.message };
  return { ok: true as const };
}
