import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { emailProjectComment } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  body: z.string().min(1).max(8000),
  title: z.string().max(200).optional(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const db = admin ? getServiceRoleClient() : await createClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let projectQuery = db
    .from("portal_projects")
    .select("id, title, client_email, client_user_id")
    .eq("id", params.id);
  if (!admin) {
    projectQuery = projectQuery.eq("client_user_id", session.user.id);
  }
  const { data: project } = await projectQuery.maybeSingle();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const authorName =
    session.user.user_metadata?.full_name ||
    session.user.user_metadata?.name ||
    session.user.email?.split("@")[0] ||
    (admin ? "Alpha Solutions" : "Client");

  const row = {
    project_id: params.id,
    body: parsed.body.trim(),
    title: parsed.title?.trim() || (admin ? "Team comment" : "Client comment"),
    author: authorName,
    is_client: !admin,
    sender_id: session.user.id,
  };

  const { data: comment, error } = await db
    .from("portal_project_updates")
    .insert(row)
    .select("*")
    .single();

  if (error) {
    console.error("[project comment]", error);
    return NextResponse.json({ error: "Comment failed" }, { status: 500 });
  }

  const service = getServiceRoleClient();
  if (service) {
    await service
      .from("portal_projects")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", params.id);
  }

  void emailProjectComment({
    projectTitle: project.title as string,
    projectId: params.id,
    clientEmail: project.client_email as string | null,
    author: authorName,
    body: parsed.body,
    fromAdmin: admin,
  });

  return NextResponse.json({ ok: true, comment });
}
