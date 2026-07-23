import { getServiceRoleClient } from "@/lib/supabase/service-role";

/**
 * Compact TMS snapshot for Ask Alpha / enhance — recent loads + optional focus load.
 */
export async function buildTmsAiContext(opts: {
  userId: string;
  loadId?: string;
  carrierProfileId?: string;
  limit?: number;
}): Promise<string> {
  const db = getServiceRoleClient();
  if (!db) return "";

  const limit = opts.limit ?? 12;
  const lines: string[] = ["TMS snapshot:"];

  if (opts.loadId) {
    const { data: focus } = await db
      .from("dispatch_loads")
      .select(
        "id, load_number, company_name, broker, load_details, pickup_date_time, delivery_date_time, miles, states, rc_invoice, status, truck_trailer, notes",
      )
      .eq("id", opts.loadId)
      .maybeSingle();
    if (focus) {
      lines.push(
        `Focus load #${focus.load_number ?? "?"}: ${focus.company_name ?? ""} | ${focus.states ?? ""} | ${focus.miles ?? "?"} mi | $${focus.rc_invoice ?? "?"} | status=${focus.status ?? "?"} | equip=${focus.truck_trailer ?? "?"} | PU=${focus.pickup_date_time ?? "?"} | DEL=${focus.delivery_date_time ?? "?"} | ${focus.load_details ?? ""} | notes=${focus.notes ?? ""}`,
      );
    }
  }

  const { data: recent } = await db
    .from("dispatch_loads")
    .select(
      "id, load_number, company_name, states, miles, rc_invoice, status, pickup_date_time, truck_trailer, deleted_at",
    )
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (recent?.length) {
    lines.push("Recent loads:");
    for (const row of recent) {
      if (opts.loadId && row.id === opts.loadId) continue;
      lines.push(
        `- #${row.load_number ?? "?"} ${row.company_name ?? ""} ${row.states ?? ""} ${row.miles ?? "?"}mi $${row.rc_invoice ?? "?"} [${row.status ?? "?"}] ${row.truck_trailer ?? ""} PU=${row.pickup_date_time ?? "?"}`,
      );
    }
  }

  if (opts.carrierProfileId) {
    const { data: carrier } = await db
      .from("profiles")
      .select("full_name, company_name, email, phone, mc_number, carrier_status")
      .eq("id", opts.carrierProfileId)
      .maybeSingle();
    if (carrier) {
      lines.push(
        `Carrier: ${carrier.company_name || carrier.full_name || "?"} | ${carrier.email ?? ""} | MC ${carrier.mc_number ?? "?"} | status=${carrier.carrier_status ?? "?"}`,
      );
    }
  }

  return lines.length > 1 ? lines.join("\n") : "";
}
