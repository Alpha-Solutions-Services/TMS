import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { notifyClientAdminMessage } from "@/lib/email/dm-notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
  body: z.string().max(8000).optional().default(""),
  attachment_path: z.string().optional(),
  attachment_mime: z.string().optional(),
  attachment_name: z.string().optional(),
});

async function signAttachments(
  messages: Array<Record<string, unknown>>,
  db: NonNullable<ReturnType<typeof getServiceRoleClient>>
) {
  return Promise.all(
    messages.map(async (m) => {
      const path = m.attachment_path as string | null | undefined;
      if (!path) return m;
      const { data } = await db.storage
        .from("dm-attachments")
        .createSignedUrl(path, 3600);
      return { ...m, attachment_url: data?.signedUrl ?? null };
    })
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) {
    return NextResponse.json({ messages: [] });
  }

  const { data, error } = await db
    .from("dm_messages")
    .select(
      "id, thread_id, sender_id, is_admin, body, created_at, edited_at, deleted_at, attachment_path, attachment_mime, attachment_name"
    )
    .eq("thread_id", params.threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[admin/messages GET]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  await db
    .from("dm_threads")
    .update({ admin_last_read_at: new Date().toISOString() })
    .eq("id", params.threadId);

  const signed = await signAttachments(
    (data ?? []) as Record<string, unknown>[],
    db
  );
  return NextResponse.json({ messages: signed, threadId: params.threadId });
}

export async function POST(
  req: NextRequest,
  { params }: { params: { threadId: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof postSchema>;
  try {
    parsed = postSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const body = (parsed.body || "").trim();
  if (!body && !parsed.attachment_path) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data: thread } = await db
    .from("dm_threads")
    .select("client_email")
    .eq("id", params.threadId)
    .maybeSingle();

  const { error: insErr } = await db.from("dm_messages").insert({
    thread_id: params.threadId,
    sender_id: session.user.id,
    is_admin: true,
    body,
    attachment_path: parsed.attachment_path ?? null,
    attachment_mime: parsed.attachment_mime ?? null,
    attachment_name: parsed.attachment_name ?? null,
  });

  if (insErr) {
    console.error("[admin/messages POST]", insErr);
    return NextResponse.json({ error: "Insert failed" }, { status: 500 });
  }

  await db
    .from("dm_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", params.threadId);

  if (thread?.client_email) {
    void notifyClientAdminMessage({
      clientEmail: thread.client_email,
      preview: body || parsed.attachment_name || "[image]",
    });
  }

  return NextResponse.json({ ok: true });
}
