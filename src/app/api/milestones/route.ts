import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createNotification } from "@/lib/notifications";
import { getPortalUrl } from "@/lib/supabase/env";

const schema = z.object({
  milestoneId: z.string().uuid(),
  action: z.enum(["request_approval", "approve", "request_changes", "set_due"]),
  note: z.string().max(2000).optional(),
  dueDate: z.string().optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data: milestone } = await db
    .from("portal_project_milestones")
    .select("*, project:portal_projects(id, title, client_user_id, client_email)")
    .eq("id", parsed.milestoneId)
    .maybeSingle();

  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const project = milestone.project as {
    id: string;
    title: string;
    client_user_id: string | null;
    client_email: string | null;
  } | null;

  const staff = await isPortalStaff(session.user);
  const isClient =
    project?.client_user_id === session.user.id ||
    project?.client_email?.toLowerCase() === session.user.email?.toLowerCase();

  if (parsed.action === "set_due" || parsed.action === "request_approval") {
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const updates: Record<string, unknown> = {};
    if (parsed.action === "set_due") updates.due_date = parsed.dueDate || null;
    if (parsed.action === "request_approval") {
      updates.requires_approval = true;
      updates.approval_status = "pending";
    }
    await db
      .from("portal_project_milestones")
      .update(updates)
      .eq("id", parsed.milestoneId);

    if (parsed.action === "request_approval" && project?.client_user_id) {
      await createNotification({
        userId: project.client_user_id,
        title: "Milestone awaiting your approval",
        body: `${milestone.title} — ${project.title}`,
        href: `${getPortalUrl()}/dashboard?tab=projects&project=${project.id}`,
        email: project.client_email,
      });
    }
    return NextResponse.json({ ok: true });
  }

  if (!isClient && !staff) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.action === "approve") {
    await db
      .from("portal_project_milestones")
      .update({
        approval_status: "approved",
        approved_at: new Date().toISOString(),
        approved_by: session.user.id,
        client_note: parsed.note || null,
        status: "done",
      })
      .eq("id", parsed.milestoneId);
  } else {
    await db
      .from("portal_project_milestones")
      .update({
        approval_status: "changes_requested",
        client_note: parsed.note || null,
      })
      .eq("id", parsed.milestoneId);
  }

  return NextResponse.json({ ok: true });
}
