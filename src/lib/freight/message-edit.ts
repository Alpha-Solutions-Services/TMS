import type { ChatAttachment } from "@/lib/freight/chat-types";
import { sanitizeText } from "@/lib/freight/api-security";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export type MessageChannel = "carrier_dm" | "thread";

export function mapChatMessageRow(
  row: {
    id: string;
    body: string | null;
    sender_role: string;
    created_at: string;
    attachments?: unknown;
    edited_at?: string | null;
    deleted_at?: string | null;
    sender_id?: string | null;
    sender_profile_id?: string | null;
  },
  currentUserId: string,
) {
  const senderId = row.sender_id ?? row.sender_profile_id ?? null;
  const deleted = Boolean(row.deleted_at);
  return {
    id: row.id,
    sender_role: row.sender_role,
    sender_id: senderId,
    body: deleted ? "" : row.body ?? "",
    created_at: row.created_at,
    attachments: deleted
      ? ([] as ChatAttachment[])
      : ((row.attachments as ChatAttachment[]) ?? []),
    edited_at: row.edited_at ?? null,
    deleted_at: row.deleted_at ?? null,
    mine: senderId === currentUserId,
  };
}

export async function editFreightMessage(opts: {
  channel: MessageChannel;
  messageId: string;
  userId: string;
  body: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false, error: "DB unavailable", status: 500 };

  const text = sanitizeText(opts.body, 4000);
  if (!text) return { ok: false, error: "Message required", status: 400 };

  if (opts.channel === "carrier_dm") {
    const { data: row } = await admin
      .from("dispatch_carrier_messages")
      .select("id, sender_profile_id, deleted_at")
      .eq("id", opts.messageId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Not found", status: 404 };
    if (row.deleted_at) return { ok: false, error: "Message deleted", status: 403 };
    if (row.sender_profile_id !== opts.userId) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
    const { error } = await admin
      .from("dispatch_carrier_messages")
      .update({ body: text, edited_at: new Date().toISOString() })
      .eq("id", opts.messageId);
    if (error) return { ok: false, error: "Update failed", status: 500 };
    return { ok: true };
  }

  const { data: row } = await admin
    .from("freight_thread_messages")
    .select("id, sender_id, deleted_at")
    .eq("id", opts.messageId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Not found", status: 404 };
  if (row.deleted_at) return { ok: false, error: "Message deleted", status: 403 };
  if (row.sender_id !== opts.userId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  const { error } = await admin
    .from("freight_thread_messages")
    .update({ body: text, edited_at: new Date().toISOString() })
    .eq("id", opts.messageId);
  if (error) return { ok: false, error: "Update failed", status: 500 };
  return { ok: true };
}

export async function deleteFreightMessage(opts: {
  channel: MessageChannel;
  messageId: string;
  userId: string;
}): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const admin = getServiceRoleClient();
  if (!admin) return { ok: false, error: "DB unavailable", status: 500 };

  if (opts.channel === "carrier_dm") {
    const { data: row } = await admin
      .from("dispatch_carrier_messages")
      .select("id, sender_profile_id")
      .eq("id", opts.messageId)
      .maybeSingle();
    if (!row) return { ok: false, error: "Not found", status: 404 };
    if (row.sender_profile_id !== opts.userId) {
      return { ok: false, error: "Forbidden", status: 403 };
    }
    const { error } = await admin
      .from("dispatch_carrier_messages")
      .update({
        deleted_at: new Date().toISOString(),
        body: "",
        attachments: [],
      })
      .eq("id", opts.messageId);
    if (error) return { ok: false, error: "Delete failed", status: 500 };
    return { ok: true };
  }

  const { data: row } = await admin
    .from("freight_thread_messages")
    .select("id, sender_id")
    .eq("id", opts.messageId)
    .maybeSingle();
  if (!row) return { ok: false, error: "Not found", status: 404 };
  if (row.sender_id !== opts.userId) {
    return { ok: false, error: "Forbidden", status: 403 };
  }
  const { error } = await admin
    .from("freight_thread_messages")
    .update({
      deleted_at: new Date().toISOString(),
      body: "",
      attachments: [],
    })
    .eq("id", opts.messageId);
  if (error) return { ok: false, error: "Delete failed", status: 500 };
  return { ok: true };
}
