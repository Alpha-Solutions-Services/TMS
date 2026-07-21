import type { SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { notifyOpsNewClientMessage } from "@/lib/email/dm-notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
  body: z.string().max(8000).optional().default(""),
  attachment_path: z.string().optional(),
  attachment_mime: z.string().optional(),
  attachment_name: z.string().optional(),
});

async function ensureThread(
  supabase: SupabaseClient,
  userId: string,
  email: string | undefined
) {
  const { data: existing } = await supabase
    .from("dm_threads")
    .select("id")
    .eq("client_user_id", userId)
    .maybeSingle();

  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase
    .from("dm_threads")
    .insert({
      client_user_id: userId,
      client_email: email ?? null,
    })
    .select("id")
    .single();

  if (error || !created?.id) {
    console.error("[dm] ensureThread", error);
    return null;
  }
  return created.id as string;
}

async function signAttachments(
  messages: Array<Record<string, unknown>>
) {
  const admin = getServiceRoleClient();
  if (!admin) return messages;
  return Promise.all(
    messages.map(async (m) => {
      const path = m.attachment_path as string | null | undefined;
      if (!path) return m;
      const { data } = await admin.storage
        .from("dm-attachments")
        .createSignedUrl(path, 3600);
      return { ...m, attachment_url: data?.signedUrl ?? null };
    })
  );
}

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json({ threadId: null, messages: [] });
  }
  const threadId = await ensureThread(
    supabase,
    session.user.id,
    session.user.email ?? undefined
  );
  if (!threadId) {
    return NextResponse.json({ threadId: null, messages: [] });
  }

  const { data: messages, error } = await supabase
    .from("dm_messages")
    .select(
      "id, is_admin, body, created_at, edited_at, deleted_at, attachment_path, attachment_mime, attachment_name, sender_id"
    )
    .eq("thread_id", threadId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("[dm GET]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  await supabase
    .from("dm_threads")
    .update({ client_last_read_at: new Date().toISOString() })
    .eq("id", threadId);

  const signed = await signAttachments((messages ?? []) as Record<string, unknown>[]);
  return NextResponse.json({ threadId, messages: signed });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

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

  const supabase = await createClient();
  if (!supabase) {
    return NextResponse.json(
      { error: "Messaging is not configured" },
      { status: 503 }
    );
  }
  const threadId = await ensureThread(
    supabase,
    session.user.id,
    session.user.email ?? undefined
  );
  if (!threadId) {
    return NextResponse.json({ error: "Could not open thread" }, { status: 500 });
  }

  const { error: insErr } = await supabase.from("dm_messages").insert({
    thread_id: threadId,
    sender_id: session.user.id,
    is_admin: false,
    body,
    attachment_path: parsed.attachment_path ?? null,
    attachment_mime: parsed.attachment_mime ?? null,
    attachment_name: parsed.attachment_name ?? null,
  });

  if (insErr) {
    console.error("[dm POST]", insErr);
    return NextResponse.json({ error: "Send failed" }, { status: 500 });
  }

  await supabase
    .from("dm_threads")
    .update({ updated_at: new Date().toISOString() })
    .eq("id", threadId);

  const preview = body || parsed.attachment_name || "[image]";
  void notifyOpsNewClientMessage({
    clientEmail: session.user.email,
    preview,
    threadId,
  });

  return NextResponse.json({ ok: true });
}
