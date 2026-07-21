import { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { ChatAttachment } from "./chat-types";

const BUCKET = "freight-chat-attachments";
const MAX_BYTES = 10 * 1024 * 1024;
const ALLOWED = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

export async function uploadChatAttachment(
  file: File,
  userId: string,
): Promise<ChatAttachment | null> {
  if (file.size > MAX_BYTES) return null;
  if (!ALLOWED.has(file.type)) return null;

  const db = getServiceRoleClient();
  if (!db) return null;

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  const path = `${userId}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    console.error("[chat-attachments] upload failed:", error);
    return null;
  }

  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (!signed?.signedUrl) return null;

  return {
    name: safeName,
    url: signed.signedUrl,
    mime: file.type,
  };
}
