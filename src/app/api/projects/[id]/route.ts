import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { emailProjectStatusChange } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

async function loadProject(id: string, admin: boolean, userId: string) {
  const db = admin ? getServiceRoleClient() : await createClient();
  if (!db) return null;
  let q = db
    .from("portal_projects")
    .select(
      "*, milestones:portal_project_milestones(*), team:portal_project_team(*), updates:portal_project_updates(*)"
    )
    .eq("id", id);
  if (!admin) q = q.eq("client_user_id", userId);
  const { data } = await q.maybeSingle();
  return data;
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const admin = isAdminUser(session.user);
  const project = await loadProject(params.id, admin, session.user.id);
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ project });
}

const patchSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(8000).optional().nullable(),
  status: z
    .enum(["planning", "in_progress", "review", "completed", "on_hold"])
    .optional(),
  progress: z.number().int().min(0).max(100).optional(),
  category: z.string().max(100).optional().nullable(),
  projectUrl: z.string().url().optional().nullable().or(z.literal("")),
  clientEmail: z.string().email().optional(),
  /** Shorthand: pause → on_hold, resume → in_progress */
  action: z.enum(["pause", "resume"]).optional(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data: existing } = await db
    .from("portal_projects")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.description !== undefined) updates.description = parsed.description;
  if (parsed.progress !== undefined) updates.progress = parsed.progress;
  if (parsed.category !== undefined) updates.category = parsed.category;
  if (parsed.projectUrl !== undefined) {
    updates.project_url = parsed.projectUrl || null;
  }
  if (parsed.clientEmail !== undefined) updates.client_email = parsed.clientEmail;

  let newStatus = parsed.status;
  if (parsed.action === "pause") newStatus = "on_hold";
  if (parsed.action === "resume") newStatus = "in_progress";
  if (newStatus !== undefined) updates.status = newStatus;

  const { error } = await db
    .from("portal_projects")
    .update(updates)
    .eq("id", params.id);
  if (error) {
    console.error("[projects PATCH]", error);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  const statusChanged =
    newStatus !== undefined && newStatus !== existing.status;
  if (statusChanged || parsed.progress !== undefined || parsed.title) {
    const note =
      parsed.action === "pause"
        ? "Project paused by the team."
        : parsed.action === "resume"
          ? "Project resumed — work is active again."
          : parsed.title
            ? `Project details updated.`
            : `Progress or status updated.`;

    await db.from("portal_project_updates").insert({
      project_id: params.id,
      author: "Alpha Solutions",
      title: parsed.action === "pause" ? "Paused" : parsed.action === "resume" ? "Resumed" : "Update",
      body: note,
      is_client: false,
    });

    if (existing.client_email) {
      void emailProjectStatusChange({
        clientEmail: existing.client_email as string,
        projectTitle: (parsed.title || existing.title) as string,
        projectId: params.id,
        status: (newStatus || existing.status) as string,
        note,
      });
    }
  }

  const project = await loadProject(params.id, true, session.user.id);
  return NextResponse.json({ ok: true, project });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { error } = await db.from("portal_projects").delete().eq("id", params.id);
  if (error) {
    console.error("[projects DELETE]", error);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
