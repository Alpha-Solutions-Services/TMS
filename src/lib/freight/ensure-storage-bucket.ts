import { getServiceRoleClient } from "@/lib/supabase/service-role";

const ensured = new Set<string>();

/** Create private storage bucket if missing (idempotent). */
export async function ensureStorageBucket(
  bucketId: string,
  opts?: { fileSizeLimit?: number },
): Promise<boolean> {
  if (ensured.has(bucketId)) return true;

  const db = getServiceRoleClient();
  if (!db) return false;

  const { data: buckets, error: listError } = await db.storage.listBuckets();
  if (listError) {
    console.error("[ensure-storage-bucket] list failed:", listError.message);
    return false;
  }

  if (buckets?.some((b) => b.id === bucketId || b.name === bucketId)) {
    ensured.add(bucketId);
    return true;
  }

  const { error } = await db.storage.createBucket(bucketId, {
    public: false,
    fileSizeLimit: opts?.fileSizeLimit ?? 26_214_400,
  });

  if (error && !/already exists|duplicate/i.test(error.message)) {
    console.error("[ensure-storage-bucket] create failed:", error.message);
    return false;
  }

  ensured.add(bucketId);
  return true;
}
