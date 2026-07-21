import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerUser, isPortalStaff, resolveStaffRole } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!(await isPortalStaff(session.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const role = await resolveStaffRole(session.user);
  const db = getServiceRoleClient();
  const { data } = db
    ? await db
        .from("portal_staff")
        .select("*")
        .order("created_at", { ascending: false })
    : { data: [] };

  return NextResponse.json({
    me: {
      email: session.user.email,
      role,
      isOwner: isOwnerUser(session.user),
    },
    staff: data ?? [],
  });
}

const schema = z.object({
  email: z.string().email(),
  role: z.enum(["owner", "staff"]).optional(),
  displayName: z.string().max(120).optional(),
  active: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isOwnerUser(session.user)) {
    return NextResponse.json(
      { error: "Only owners can manage staff" },
      { status: 403 }
    );
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
    .from("portal_staff")
    .upsert(
      {
        email: parsed.email.toLowerCase(),
        role: parsed.role || "staff",
        display_name: parsed.displayName || null,
        active: parsed.active !== false,
        invited_by: session.user.id,
      },
      { onConflict: "email" }
    )
    .select("*")
    .single();

  if (error) {
    console.error("[staff]", error);
    return NextResponse.json({ error: "Save failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    staff: data,
    hint: "Also add this email to ADMIN_EMAILS in Vercel for full API access until next deploy sync.",
  });
}

export async function DELETE(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isOwnerUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  await db.from("portal_staff").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
