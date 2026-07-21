import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type SubDispatcherStat = {
  userId: string;
  email: string;
  fullName: string | null;
  loadsThisMonth: number;
  pendingApprovals: number;
  approvedThisMonth: number;
};

export async function fetchSubDispatcherStats(monthTab?: string): Promise<SubDispatcherStat[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data: subs } = await admin
    .from("tms_users")
    .select("id, email, full_name")
    .eq("role", "sub_dispatcher")
    .eq("active", true);

  if (!subs?.length) return [];

  const tab = monthTab?.trim();
  const stats: SubDispatcherStat[] = [];

  for (const sub of subs) {
    let loadQuery = admin
      .from("dispatch_loads")
      .select("id", { count: "exact", head: true })
      .eq("created_by", sub.id)
      .is("deleted_at", null);
    if (tab) loadQuery = loadQuery.eq("month_tab", tab);

    const { count: loadsThisMonth } = await loadQuery;

    const { count: pendingApprovals } = await admin
      .from("dispatch_load_approvals")
      .select("id", { count: "exact", head: true })
      .eq("requested_by", sub.id)
      .eq("status", "pending");

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { count: approvedThisMonth } = await admin
      .from("dispatch_load_approvals")
      .select("id", { count: "exact", head: true })
      .eq("requested_by", sub.id)
      .eq("status", "approved")
      .gte("reviewed_at", monthStart.toISOString());

    stats.push({
      userId: sub.id as string,
      email: (sub.email as string) ?? "",
      fullName: (sub.full_name as string) ?? null,
      loadsThisMonth: loadsThisMonth ?? 0,
      pendingApprovals: pendingApprovals ?? 0,
      approvedThisMonth: approvedThisMonth ?? 0,
    });
  }

  return stats.sort((a, b) => b.loadsThisMonth - a.loadsThisMonth);
}
