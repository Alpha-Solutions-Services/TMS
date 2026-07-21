import { getServiceRoleClient } from "@/lib/supabase/service-role";
import type { ChatAttachment } from "./chat-types";
import { ensureStorageBucket } from "./ensure-storage-bucket";
import {
  MAX_UPLOAD_BYTES,
  maxUploadLabelMb,
  resolveUploadMime,
} from "./upload-mime";

const BUCKET = "freight-chat-attachments";

export type UploadAttachmentResult =
  | { ok: true; attachment: ChatAttachment }
  | { ok: false; error: string };

export async function uploadChatAttachment(
  file: File,
  userId: string,
): Promise<UploadAttachmentResult> {
  if (file.size > MAX_UPLOAD_BYTES) {
    return {
      ok: false,
      error: `File too large (max ${maxUploadLabelMb()}MB)`,
    };
  }

  const mime = resolveUploadMime(file);
  if (!mime) {
    return {
      ok: false,
      error: "Upload PDF or image (JPG, PNG, WEBP)",
    };
  }

  const db = getServiceRoleClient();
  if (!db) {
    return { ok: false, error: "Storage not configured" };
  }

  await ensureStorageBucket(BUCKET);

  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 120);
  const path = `${userId}/${Date.now()}-${safeName}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  let { error } = await db.storage.from(BUCKET).upload(path, buffer, {
    contentType: mime,
    upsert: false,
  });

  if (error && /bucket not found/i.test(error.message)) {
    await ensureStorageBucket(BUCKET);
    ({ error } = await db.storage.from(BUCKET).upload(path, buffer, {
      contentType: mime,
      upsert: false,
    }));
  }

  if (error) {
    console.error("[chat-attachments] upload failed:", error);
    return {
      ok: false,
      error: /bucket not found/i.test(error.message)
        ? "Storage bucket missing — contact support"
        : "Storage upload failed",
    };
  }

  const { data: signed } = await db.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60 * 24 * 7);

  if (!signed?.signedUrl) {
    return { ok: false, error: "Could not create download link" };
  }

  return {
    ok: true,
    attachment: {
      name: safeName,
      url: signed.signedUrl,
      mime,
    },
  };
}
