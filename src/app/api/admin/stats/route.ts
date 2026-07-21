import { NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) {
    return NextResponse.json(
      { error: "Server database not configured" },
      { status: 503 }
    );
  }

  const since = new Date();
  since.setDate(since.getDate() - 7);

  const [
    { count: inquiriesTotal },
    { count: inquiriesNew },
    { count: threadsTotal },
    { count: messagesWeek },
    { count: pageviewsWeek },
    { data: threads },
  ] = await Promise.all([
    db.from("contact_inquiries").select("*", { count: "exact", head: true }),
    db
      .from("contact_inquiries")
      .select("*", { count: "exact", head: true })
      .eq("status", "new"),
    db.from("dm_threads").select("*", { count: "exact", head: true }),
    db
      .from("dm_messages")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since.toISOString()),
    db
      .from("page_views")
      .select("*", { count: "exact", head: true })
      .gte("created_at", since.toISOString()),
    db.from("dm_threads").select("id, admin_last_read_at").limit(500),
  ]);

  let unreadClientMessages = 0;
  for (const t of threads ?? []) {
    const readAt = t.admin_last_read_at as string | null;
    let q = db
      .from("dm_messages")
      .select("*", { count: "exact", head: true })
      .eq("thread_id", t.id)
      .eq("is_admin", false);
    if (readAt) q = q.gt("created_at", readAt);
    const { count } = await q;
    unreadClientMessages += count ?? 0;
  }

  return NextResponse.json({
    inquiriesTotal: inquiriesTotal ?? 0,
    inquiriesNew: inquiriesNew ?? 0,
    activeClientThreads: threadsTotal ?? 0,
    unreadClientMessages,
    messagesLast7Days: messagesWeek ?? 0,
    pageViewsLast7Days: pageviewsWeek ?? 0,
  });
}
