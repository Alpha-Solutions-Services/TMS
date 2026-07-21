import { NextResponse } from "next/server";
import { isOwnerUser, isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!(await isPortalStaff(session.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) {
    return NextResponse.json({
      revenueByService: [],
      openTickets: 0,
      avgResponseHours: null,
      dealsByStage: {},
      bookingsUpcoming: 0,
      contractsPending: 0,
      quotesOpen: 0,
    });
  }

  const owner = isOwnerUser(session.user);
  const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

  const [
    dealsRes,
    ticketsRes,
    ticketMsgsRes,
    bookingsRes,
    contractsRes,
    quotesRes,
  ] = await Promise.all([
    db.from("portal_deals").select("stage, service_slug, estimated_value, updated_at"),
    db
      .from("support_tickets")
      .select("id, status, created_at")
      .in("status", ["open", "in_progress", "waiting"]),
    db
      .from("support_ticket_messages")
      .select("ticket_id, is_admin, created_at")
      .gte("created_at", since)
      .order("created_at", { ascending: true })
      .limit(2000),
    db
      .from("portal_bookings")
      .select("id")
      .gte("starts_at", new Date().toISOString())
      .eq("status", "confirmed"),
    db
      .from("portal_contracts")
      .select("id")
      .in("status", ["sent", "viewed"]),
    db
      .from("portal_quotes")
      .select("id")
      .eq("status", "sent"),
  ]);

  const deals = dealsRes.data ?? [];
  const dealsByStage: Record<string, number> = {};
  const revenueMap: Record<string, number> = {};
  for (const d of deals) {
    dealsByStage[d.stage] = (dealsByStage[d.stage] || 0) + 1;
    if (d.stage === "won" && owner) {
      const svc = d.service_slug || "other";
      revenueMap[svc] =
        (revenueMap[svc] || 0) + Number(d.estimated_value || 0);
    }
  }

  // Avg first admin response time (hours)
  const msgs = ticketMsgsRes.data ?? [];
  const byTicket = new Map<string, { firstClient?: string; firstAdmin?: string }>();
  for (const m of msgs) {
    const row = byTicket.get(m.ticket_id) || {};
    if (!m.is_admin && !row.firstClient) row.firstClient = m.created_at;
    if (m.is_admin && row.firstClient && !row.firstAdmin)
      row.firstAdmin = m.created_at;
    byTicket.set(m.ticket_id, row);
  }
  const deltas: number[] = [];
  Array.from(byTicket.values()).forEach((v) => {
    if (v.firstClient && v.firstAdmin) {
      deltas.push(
        (new Date(v.firstAdmin).getTime() - new Date(v.firstClient).getTime()) /
          3600000
      );
    }
  });
  const avgResponseHours =
    deltas.length > 0
      ? Math.round((deltas.reduce((a, b) => a + b, 0) / deltas.length) * 10) / 10
      : null;

  return NextResponse.json({
    revenueByService: owner
      ? Object.entries(revenueMap).map(([service, value]) => ({
          service,
          value,
        }))
      : [],
    revenueVisible: owner,
    openTickets: (ticketsRes.data ?? []).length,
    avgResponseHours,
    dealsByStage,
    bookingsUpcoming: (bookingsRes.data ?? []).length,
    contractsPending: (contractsRes.data ?? []).length,
    quotesOpen: (quotesRes.data ?? []).length,
    pipelineValue: owner
      ? deals
          .filter((d) => !["won", "lost"].includes(d.stage))
          .reduce((s, d) => s + Number(d.estimated_value || 0), 0)
      : null,
  });
}
