import { NextRequest, NextResponse } from "next/server";
import { isAdminUser } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  const path = req.nextUrl.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  const admin = isAdminUser(session.user);
  const folder = path.split("/")[0];
  if (!admin && folder !== session.user.id) {
    // Client may only access own folder OR paths on their thread (admin uploads use client folder)
    const supabase = await createClient();
    if (!supabase) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data: thread } = await supabase
      .from("dm_threads")
      .select("id")
      .eq("client_user_id", session.user.id)
      .maybeSingle();
    if (!thread) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (folder !== session.user.id) {
      // allow if message with this path exists on their thread
      const { data: msg } = await supabase
        .from("dm_messages")
        .select("id")
        .eq("thread_id", thread.id)
        .eq("attachment_path", path)
        .maybeSingle();
      if (!msg) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
  }

  const service = getServiceRoleClient();
  if (!service) {
    return NextResponse.json({ error: "Not configured" }, { status: 503 });
  }

  const { data, error } = await service.storage
    .from("dm-attachments")
    .createSignedUrl(path, 120);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl);
}
