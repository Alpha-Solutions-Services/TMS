import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { emailTicketCreated } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";

const createSchema = z.object({
  subject: z.string().min(3).max(200),
  description: z.string().min(10).max(8000),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  projectId: z.string().uuid().optional().nullable(),
});

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ tickets: [] });

  const { data, error } = await supabase
    .from("support_tickets")
    .select("id, subject, description, status, priority, created_at, updated_at, project_id")
    .eq("client_user_id", session.user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    console.error("[tickets GET]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ tickets: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data, error } = await supabase
    .from("support_tickets")
    .insert({
      client_user_id: session.user.id,
      client_email: session.user.email ?? null,
      subject: parsed.subject,
      description: parsed.description,
      priority: parsed.priority ?? "medium",
      project_id: parsed.projectId ?? null,
      status: "open",
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[tickets POST]", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  await supabase.from("support_ticket_messages").insert({
    ticket_id: data.id,
    sender_id: session.user.id,
    is_admin: false,
    is_ai: false,
    body: parsed.description,
  });

  void emailTicketCreated({
    clientEmail: session.user.email,
    subject: parsed.subject,
    description: parsed.description,
    ticketId: data.id,
  });

  return NextResponse.json({ ok: true, id: data.id });
}
