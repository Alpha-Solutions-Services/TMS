import { NextRequest, NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { ensureLoadChatThread, listLoadThreadsForUser } from "@/lib/freight/load-chat-thread";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const threads = await listLoadThreadsForUser(user.id);
  return NextResponse.json({ threads });
}

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const body = (await req.json()) as { loadId?: string };
  if (!body.loadId) {
    return NextResponse.json({ error: "loadId required" }, { status: 400 });
  }

  const threadId = await ensureLoadChatThread(body.loadId, user.id);
  if (!threadId) {
    return NextResponse.json({ error: "Could not open load chat" }, { status: 500 });
  }

  const db = getServiceRoleClient();
  const { data: thread } = await db
    ?.from("freight_threads")
    .select("id, load_id, load_number, title, updated_at")
    .eq("id", threadId)
    .maybeSingle() ?? { data: null };

  return NextResponse.json({ threadId, thread });
}
