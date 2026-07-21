import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerUser, isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ articles: [] });

  const staff = await isPortalStaff(session.user);
  let q = db
    .from("portal_knowledge")
    .select("*")
    .order("sort_order", { ascending: true })
    .limit(200);
  if (!staff) q = q.eq("active", true);
  const { data } = await q;
  return NextResponse.json({ articles: data ?? [] });
}

const schema = z.object({
  id: z.string().uuid().optional(),
  category: z.string().max(80).optional(),
  question: z.string().min(3).max(500),
  answer: z.string().min(10).max(20000),
  tags: z.array(z.string()).optional(),
  active: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!(await isPortalStaff(session.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data, error } = await db
    .from("portal_knowledge")
    .insert({
      category: parsed.category || "general",
      question: parsed.question,
      answer: parsed.answer,
      tags: parsed.tags || [],
      active: parsed.active !== false,
      sort_order: parsed.sortOrder ?? 0,
      created_by: session.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: "Create failed" }, { status: 500 });
  return NextResponse.json({ ok: true, article: data });
}

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!(await isPortalStaff(session.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid" }, { status: 400 });
  }
  if (!parsed.id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { error } = await db
    .from("portal_knowledge")
    .update({
      category: parsed.category,
      question: parsed.question,
      answer: parsed.answer,
      tags: parsed.tags,
      active: parsed.active,
      sort_order: parsed.sortOrder,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.id);

  if (error) return NextResponse.json({ error: "Update failed" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isOwnerUser(session.user) && !(await isPortalStaff(session.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  await db.from("portal_knowledge").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
