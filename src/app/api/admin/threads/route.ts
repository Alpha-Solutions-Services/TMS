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
    return NextResponse.json({ threads: [] });
  }

  const { data: threads, error } = await db
    .from("dm_threads")
    .select(
      "id, client_user_id, client_email, created_at, updated_at, admin_last_read_at"
    )
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/threads]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const enriched = await Promise.all(
    (threads ?? []).map(async (t) => {
      const { data: last } = await db
        .from("dm_messages")
        .select("body, created_at, is_admin, attachment_name")
        .eq("thread_id", t.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      const { count } = await db
        .from("dm_messages")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", t.id);

      let unread = 0;
      let q = db
        .from("dm_messages")
        .select("*", { count: "exact", head: true })
        .eq("thread_id", t.id)
        .eq("is_admin", false);
      if (t.admin_last_read_at) {
        q = q.gt("created_at", t.admin_last_read_at);
      }
      const { count: uc } = await q;
      unread = uc ?? 0;

      return {
        ...t,
        messageCount: count ?? 0,
        unread,
        lastMessage: last
          ? {
              body: last.body || last.attachment_name || "[image]",
              created_at: last.created_at,
              is_admin: last.is_admin,
            }
          : null,
      };
    })
  );

  return NextResponse.json({ threads: enriched });
}
