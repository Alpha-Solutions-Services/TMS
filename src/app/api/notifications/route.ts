import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/portal/require-session";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ notifications: [], unread: 0 });

  const { data } = await supabase
    .from("portal_notifications")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(40);

  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  return NextResponse.json({ notifications: list, unread });
}

const patchSchema = z.object({
  ids: z.array(z.string().uuid()).optional(),
  all: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const supabase = await createClient();
  if (!supabase) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const now = new Date().toISOString();
  if (parsed.all) {
    await supabase
      .from("portal_notifications")
      .update({ read_at: now })
      .eq("user_id", session.user.id)
      .is("read_at", null);
  } else if (parsed.ids?.length) {
    await supabase
      .from("portal_notifications")
      .update({ read_at: now })
      .eq("user_id", session.user.id)
      .in("id", parsed.ids);
  }

  return NextResponse.json({ ok: true });
}

/** Admin/service helper — not used by clients for insert (RLS blocks) */
export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  // Clients cannot create arbitrary notifs — no-op safety
  return NextResponse.json({ error: "Use server helpers" }, { status: 403 });
}
