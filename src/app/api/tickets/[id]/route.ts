import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { emailTicketReply } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { isAdminUser } from "@/lib/admin-auth";

const postSchema = z.object({
  body: z.string().min(1).max(8000),
});

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const admin = isAdminUser(session.user);
  const db = admin ? getServiceRoleClient() : await createClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let ticketQuery = db.from("support_tickets").select("*").eq("id", params.id);
  if (!admin) ticketQuery = ticketQuery.eq("client_user_id", session.user.id);

  const { data: ticket, error } = await ticketQuery.maybeSingle();
  if (error || !ticket) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: messages } = await db
    .from("support_ticket_messages")
    .select("id, is_admin, is_ai, body, created_at, sender_id")
    .eq("ticket_id", params.id)
    .order("created_at", { ascending: true });

  return NextResponse.json({ ticket, messages: messages ?? [] });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof postSchema>;
  try {
    parsed = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const db = admin ? getServiceRoleClient() : await createClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let ticketQuery = db
    .from("support_tickets")
    .select("id, subject, client_email, client_user_id")
    .eq("id", params.id);
  if (!admin) ticketQuery = ticketQuery.eq("client_user_id", session.user.id);

  const { data: ticket } = await ticketQuery.maybeSingle();
  if (!ticket) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await db.from("support_ticket_messages").insert({
    ticket_id: params.id,
    sender_id: session.user.id,
    is_admin: admin,
    is_ai: false,
    body: parsed.body.trim(),
  });
  if (error) {
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  await db
    .from("support_tickets")
    .update({
      updated_at: new Date().toISOString(),
      status: admin ? "waiting_client" : "in_progress",
    })
    .eq("id", params.id);

  if (ticket.client_email) {
    void emailTicketReply({
      clientEmail: ticket.client_email,
      subject: ticket.subject,
      preview: parsed.body,
      fromAdmin: admin,
    });
  }

  return NextResponse.json({ ok: true });
}

const patchSchema = z.object({
  status: z
    .enum(["open", "in_progress", "waiting_client", "resolved", "closed"])
    .optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
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
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.status) updates.status = parsed.status;
  if (parsed.priority) updates.priority = parsed.priority;

  const { error } = await db
    .from("support_tickets")
    .update(updates)
    .eq("id", params.id);
  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
