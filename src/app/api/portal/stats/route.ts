import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({
      unreadMessages: 0,
      aiChats: 0,
    });
  }

  const { data: thread } = await supabase
    .from("dm_threads")
    .select("id, client_last_read_at")
    .eq("client_user_id", session.user.id)
    .maybeSingle();

  let unreadMessages = 0;
  if (thread) {
    let q = supabase
      .from("dm_messages")
      .select("*", { count: "exact", head: true })
      .eq("thread_id", thread.id)
      .eq("is_admin", true);
    if (thread.client_last_read_at) {
      q = q.gt("created_at", thread.client_last_read_at);
    }
    const { count } = await q;
    unreadMessages = count ?? 0;
  }

  const { count: aiChats } = await supabase
    .from("ai_conversations")
    .select("*", { count: "exact", head: true })
    .eq("user_id", session.user.id);

  return NextResponse.json({
    unreadMessages,
    aiChats: aiChats ?? 0,
  });
}
