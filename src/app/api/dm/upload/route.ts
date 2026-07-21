import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);
const MAX = 5 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json({ error: "Invalid image type" }, { status: 400 });
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "Max 5MB" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const threadId = String(form.get("threadId") || "");

  let folderUserId = session.user.id;
  if (admin && threadId) {
    const service = getServiceRoleClient();
    if (!service) {
      return NextResponse.json({ error: "Not configured" }, { status: 503 });
    }
    const { data: thread } = await service
      .from("dm_threads")
      .select("client_user_id")
      .eq("id", threadId)
      .maybeSingle();
    if (thread?.client_user_id) {
      folderUserId = thread.client_user_id as string;
    }
  }

  const ext =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : file.type === "image/gif"
          ? "gif"
          : "jpg";
  const path = `${folderUserId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const service = getServiceRoleClient();
  const supabase = service || (await createClient());
  if (!supabase) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error } = await supabase.storage
    .from("dm-attachments")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (error) {
    console.error("[dm/upload]", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  let url: string | undefined;
  if (service) {
    const { data } = await service.storage
      .from("dm-attachments")
      .createSignedUrl(path, 3600);
    url = data?.signedUrl;
  }

  return NextResponse.json({
    path,
    mime: file.type,
    name: file.name,
    url,
  });
}
