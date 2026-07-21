import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { emailProjectAssigned } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const admin = isAdminUser(session.user);
  if (admin) {
    const db = getServiceRoleClient();
    if (!db) return NextResponse.json({ projects: [] });
    const { data } = await db
      .from("portal_projects")
      .select("*, milestones:portal_project_milestones(*), team:portal_project_team(*), updates:portal_project_updates(*)")
      .order("updated_at", { ascending: false })
      .limit(100);
    return NextResponse.json({ projects: data ?? [] });
  }

  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ projects: [] });
  const { data } = await supabase
    .from("portal_projects")
    .select("*, milestones:portal_project_milestones(*), team:portal_project_team(*), updates:portal_project_updates(*)")
    .eq("client_user_id", session.user.id)
    .order("updated_at", { ascending: false });
  return NextResponse.json({ projects: data ?? [] });
}

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(8000).optional(),
  clientEmail: z.string().email(),
  clientUserId: z.string().uuid().optional().nullable(),
  status: z
    .enum(["planning", "in_progress", "review", "completed", "on_hold"])
    .optional(),
  progress: z.number().int().min(0).max(100).optional(),
  category: z.string().max(100).optional(),
  projectUrl: z.string().url().optional().nullable().or(z.literal("")),
  team: z
    .array(
      z.object({
        name: z.string().min(1),
        role: z.string().optional(),
      })
    )
    .optional(),
  milestones: z
    .array(
      z.object({
        title: z.string().min(1),
        status: z.enum(["pending", "in_progress", "done"]).optional(),
        dueDate: z.string().optional(),
      })
    )
    .optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let clientUserId = parsed.clientUserId ?? null;
  if (!clientUserId) {
    const { data: users } = await db.auth.admin.listUsers({ perPage: 1000 });
    const match = users?.users?.find(
      (u) => u.email?.toLowerCase() === parsed.clientEmail.toLowerCase()
    );
    clientUserId = match?.id ?? null;
  }

  const { data: project, error } = await db
    .from("portal_projects")
    .insert({
      title: parsed.title,
      description: parsed.description ?? null,
      client_email: parsed.clientEmail,
      client_user_id: clientUserId,
      status: parsed.status ?? "planning",
      progress: parsed.progress ?? 0,
      category: parsed.category ?? "Client Project",
      project_url: parsed.projectUrl || null,
      created_by: session.user.id,
    })
    .select("id")
    .single();

  if (error || !project) {
    console.error("[projects POST]", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  if (parsed.team?.length) {
    await db.from("portal_project_team").insert(
      parsed.team.map((t, i) => ({
        project_id: project.id,
        name: t.name,
        role: t.role ?? "Team",
        sort_order: i,
      }))
    );
  }

  if (parsed.milestones?.length) {
    await db.from("portal_project_milestones").insert(
      parsed.milestones.map((m, i) => ({
        project_id: project.id,
        title: m.title,
        status: m.status ?? "pending",
        due_date: m.dueDate || null,
        sort_order: i,
      }))
    );
  }

  await db.from("portal_project_updates").insert({
    project_id: project.id,
    author: "Alpha Solutions",
    title: "Project started",
    body: "Your project has been created. The team will post progress updates here.",
  });

  void emailProjectAssigned({
    clientEmail: parsed.clientEmail,
    title: parsed.title,
    projectId: project.id,
  });

  return NextResponse.json({ ok: true, id: project.id });
}
