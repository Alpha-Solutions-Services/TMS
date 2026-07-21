import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { notifyOps } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getPortalUrl } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const ALLOWED = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/plain",
  "text/csv",
]);
const MAX = 15 * 1024 * 1024;

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const admin = isAdminUser(session.user);
  const service = getServiceRoleClient();
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ files: [] });

  if (admin && service) {
    const { data } = await service
      .from("portal_files")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return NextResponse.json({ files: data ?? [] });
  }

  const { data } = await supabase
    .from("portal_files")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false });
  return NextResponse.json({ files: data ?? [] });
}

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (!ALLOWED.has(file.type)) {
    return NextResponse.json(
      { error: "File type not allowed. Use images, PDF, Word, Excel, or text." },
      { status: 400 }
    );
  }
  if (file.size > MAX) {
    return NextResponse.json({ error: "Max file size is 15MB" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const targetUserId = String(form.get("userId") || session.user.id);
  const note = String(form.get("note") || "").slice(0, 500) || null;
  const projectId = String(form.get("projectId") || "") || null;

  if (!admin && targetUserId !== session.user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const service = getServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "Storage not configured" }, { status: 503 });
  }

  const safeName = file.name.replace(/[^\w.\- ()]/g, "_").slice(0, 120);
  const ext = safeName.includes(".") ? safeName.split(".").pop() : "bin";
  const path = `${targetUserId}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await service.storage
    .from("portal-files")
    .upload(path, buffer, { contentType: file.type, upsert: false });

  if (upErr) {
    console.error("[portal-files upload]", upErr);
    return NextResponse.json(
      { error: "Upload failed. Ensure portal-files bucket exists (run portal-files.sql)." },
      { status: 500 }
    );
  }

  const { data: row, error } = await service
    .from("portal_files")
    .insert({
      user_id: targetUserId,
      uploaded_by: session.user.id,
      is_admin_upload: admin && targetUserId !== session.user.id,
      file_name: safeName,
      storage_path: path,
      mime_type: file.type,
      size_bytes: file.size,
      project_id: projectId,
      note,
    })
    .select("*")
    .single();

  if (error || !row) {
    console.error("[portal-files insert]", error);
    return NextResponse.json({ error: "Could not save file record" }, { status: 500 });
  }

  if (!admin) {
    void notifyOps({
      subject: `File uploaded by ${session.user.email || "client"}`,
      title: "New portal file",
      html: `<p>Client uploaded <strong>${safeName}</strong> (${Math.round(file.size / 1024)} KB).</p>
        <p><a href="${getPortalUrl()}/admin" style="color:#38a3ff;">Open admin</a></p>`,
    });
  }

  const { data: signed } = await service.storage
    .from("portal-files")
    .createSignedUrl(path, 3600);

  return NextResponse.json({
    ok: true,
    file: row,
    url: signed?.signedUrl,
  });
}
