import { NextResponse } from "next/server";
import { getPortalUser } from "@/lib/portal/auth";
import {
  isSuperDispatcherEmail,
  requireSuperDispatcher,
  revokeSubDispatcherAccess,
  syncSubDispatcherProfile,
} from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await db
    .from("tms_users")
    .select("id, email, full_name, role, active, created_at")
    .in("role", ["sub_dispatcher", "super_dispatcher"])
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

/** Invite a sub dispatcher (must have signed up once). Super dispatcher only. */
export async function POST(req: Request) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    email: string;
    full_name?: string;
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const emailNorm = body.email.trim().toLowerCase();
  if (isSuperDispatcherEmail(emailNorm)) {
    return NextResponse.json(
      { error: "Super dispatchers are managed via SUPER_DISPATCHER_EMAILS env." },
      { status: 400 },
    );
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: authUsers } = await db.auth.admin.listUsers();
  const authUser = authUsers?.users?.find(
    (u) => u.email?.toLowerCase() === emailNorm,
  );

  if (!authUser) {
    return NextResponse.json(
      {
        error:
          "User must sign up at tms.alphasolutions.software first, then you can invite them as sub dispatcher.",
      },
      { status: 404 },
    );
  }

  const { data, error } = await db
    .from("tms_users")
    .upsert(
      {
        id: authUser.id,
        email: emailNorm,
        full_name: body.full_name?.trim() || null,
        role: "sub_dispatcher",
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncSubDispatcherProfile(authUser.id, emailNorm, body.full_name);

  return NextResponse.json({ user: data });
}

/** Terminate a sub dispatcher. Super dispatcher only. */
export async function DELETE(req: Request) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  if (id === auth.user.id) {
    return NextResponse.json({ error: "You cannot terminate your own access." }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: target } = await db
    .from("tms_users")
    .select("id, email, role, active")
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  if (target.role !== "sub_dispatcher") {
    return NextResponse.json(
      { error: "Only sub dispatchers can be terminated from Team." },
      { status: 400 },
    );
  }

  if (isSuperDispatcherEmail(target.email)) {
    return NextResponse.json({ error: "Cannot terminate a super dispatcher." }, { status: 400 });
  }

  await revokeSubDispatcherAccess(id);

  return NextResponse.json({ ok: true });
}
