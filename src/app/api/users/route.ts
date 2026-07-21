import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const ASSIGNABLE_ROLES = [
  "super_dispatcher",
  "sub_dispatcher",
  "carrier",
  "driver",
] as const;

export async function GET() {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await db
    .from("tms_users")
    .select("id, email, full_name, role, active, created_at")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: Request) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const role = await resolveTmsRole(user);
  if (role !== "super_dispatcher") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await req.json()) as {
    email: string;
    full_name?: string;
    role: (typeof ASSIGNABLE_ROLES)[number];
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }
  if (!ASSIGNABLE_ROLES.includes(body.role)) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  // Look up auth user by email (must have signed up once)
  const { data: authUsers } = await db.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(
    (u) => u.email?.toLowerCase() === body.email.trim().toLowerCase()
  );

  if (!authUser) {
    return NextResponse.json(
      {
        error:
          "User must sign up at tms.alphasolutions.software first, then you can assign their role.",
      },
      { status: 404 }
    );
  }

  const { data, error } = await db
    .from("tms_users")
    .upsert(
      {
        id: authUser.id,
        email: body.email.trim().toLowerCase(),
        full_name: body.full_name?.trim() || null,
        role: body.role,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ user: data });
}
