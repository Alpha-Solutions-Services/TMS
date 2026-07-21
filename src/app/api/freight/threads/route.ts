import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logFreightAction } from "@/lib/freight/audit-log";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";
import { getSuperDispatcherAllowlistEmails } from "@/lib/tms/super-users";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().min(2).max(120),
  memberIds: z.array(z.string().uuid()).min(1),
  memberRoles: z.record(z.string(), z.string()).optional(),
});

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: memberships } = await db
    .from("freight_thread_members")
    .select("thread_id")
    .eq("user_id", user.id);

  const threadIds = (memberships ?? []).map((m) => m.thread_id);
  if (threadIds.length === 0) {
    return NextResponse.json({ threads: [] });
  }

  const { data: threads } = await db
    .from("freight_threads")
    .select("id, title, thread_type, created_at, updated_at")
    .in("id", threadIds)
    .order("updated_at", { ascending: false });

  return NextResponse.json({ threads: threads ?? [] });
}

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const memberSet = new Set(body.memberIds);
  memberSet.add(user.id);

  const superEmails = getSuperDispatcherAllowlistEmails();
  const { data: authUsers } = await db.auth.admin.listUsers();
  for (const email of superEmails) {
    const superUser = authUsers?.users?.find((u) => u.email?.toLowerCase() === email);
    if (superUser?.id) memberSet.add(superUser.id);
  }

  const { data: thread, error } = await db
    .from("freight_threads")
    .insert({
      title: body.title.trim(),
      thread_type: "group",
      created_by: user.id,
    })
    .select("id")
    .single();

  if (error || !thread) {
    return NextResponse.json({ error: "Could not create group" }, { status: 500 });
  }

  const rows = Array.from(memberSet).map((uid) => ({
    thread_id: thread.id,
    user_id: uid,
    role: body.memberRoles?.[uid] ?? (uid === user.id ? "creator" : "member"),
  }));

  await db.from("freight_thread_members").insert(rows);

  await logFreightAction({
    actorId: user.id,
    actorEmail: user.email,
    action: "thread.created",
    entityType: "freight_thread",
    entityId: thread.id,
    meta: { title: body.title, members: rows.length },
  });

  return NextResponse.json({ id: thread.id });
}
