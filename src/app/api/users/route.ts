import { NextResponse } from "next/server";
import { logFreightAction } from "@/lib/freight/audit-log";
import {
  sendTeamInviteEmail,
  sendTeamTerminatedEmail,
} from "@/lib/freight/emails";
import { tmsLoginUrl } from "@/lib/tms/dispatcher-assignments";
import {
  inviteRoleLabel,
  isInviteTeamRole,
  type InviteTeamRole,
} from "@/lib/tms/permissions";
import {
  isSuperDispatcherEmail,
  requireSuperDispatcher,
  revokeTeamMemberAccess,
  syncSubDispatcherProfile,
  tmsDisplayName,
} from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

const TEAM_ROLES: InviteTeamRole[] = ["dispatcher", "sub_dispatcher"];

export async function GET() {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data, error } = await db
    .from("tms_users")
    .select("id, email, full_name, role, active, created_at")
    .in("role", TEAM_ROLES)
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ users: data ?? [] });
}

export async function POST(req: Request) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const body = (await req.json()) as {
    email: string;
    full_name?: string;
    role?: string;
  };

  if (!body.email?.trim()) {
    return NextResponse.json({ error: "Email required" }, { status: 400 });
  }

  const teamRole: InviteTeamRole = isInviteTeamRole(body.role ?? "")
    ? (body.role as InviteTeamRole)
    : "sub_dispatcher";

  const emailNorm = body.email.trim().toLowerCase();
  if (isSuperDispatcherEmail(emailNorm)) {
    return NextResponse.json(
      { error: "Super dispatchers are managed via SUPER_DISPATCHER_EMAILS env." },
      { status: 400 },
    );
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  let authUserId: string;
  let invitedViaSupabase = false;

  const { data: listData } = await db.auth.admin.listUsers();
  let authUser = listData?.users?.find((u) => u.email?.toLowerCase() === emailNorm);

  if (!authUser) {
    const { data: existingTms } = await db
      .from("tms_users")
      .select("id")
      .eq("email", emailNorm)
      .maybeSingle();
    if (existingTms?.id) {
      const { data: authData } = await db.auth.admin.getUserById(existingTms.id);
      authUser = authData.user ?? undefined;
    }
  }

  if (!authUser) {
    const { data: invited, error: inviteErr } = await db.auth.admin.inviteUserByEmail(
      emailNorm,
      {
        data: {
          full_name: body.full_name?.trim() || null,
          role: teamRole,
        },
        redirectTo: tmsLoginUrl(),
      },
    );

    if (inviteErr || !invited.user?.id) {
      return NextResponse.json(
        {
          error:
            inviteErr?.message ??
            "Could not send invite email. Check Supabase Auth email settings or SMTP.",
        },
        { status: 500 },
      );
    }
    authUser = invited.user;
    authUserId = invited.user.id;
    invitedViaSupabase = true;
  } else {
    authUserId = authUser.id;
  }

  const { data, error } = await db
    .from("tms_users")
    .upsert(
      {
        id: authUserId,
        email: emailNorm,
        full_name: body.full_name?.trim() || null,
        role: teamRole,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncSubDispatcherProfile(authUserId, emailNorm, body.full_name);

  const roleLabel = inviteRoleLabel(teamRole);
  const emailResult = await sendTeamInviteEmail({
    to: emailNorm,
    inviteeName: body.full_name?.trim() || emailNorm,
    roleLabel,
    inviterName: tmsDisplayName(auth.user),
    loginUrl: tmsLoginUrl(),
  });

  await logFreightAction({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "team.invite",
    entityType: "tms_user",
    entityId: authUserId,
    meta: { email: emailNorm, role: teamRole, invitedViaSupabase },
  });

  return NextResponse.json({
    user: data,
    emailSent: emailResult.ok || invitedViaSupabase,
    emailError:
      emailResult.ok || invitedViaSupabase
        ? undefined
        : emailResult.error ?? "SMTP not configured — set SMTP_* on Vercel",
    supabaseInviteSent: invitedViaSupabase,
  });
}

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
    .select("id, email, full_name, role, active")
    .eq("id", id)
    .maybeSingle();

  if (!target) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  if (target.role !== "dispatcher" && target.role !== "sub_dispatcher") {
    return NextResponse.json(
      { error: "Only dispatch team members can be terminated here." },
      { status: 400 },
    );
  }

  if (isSuperDispatcherEmail(target.email)) {
    return NextResponse.json({ error: "Cannot terminate a super dispatcher." }, { status: 400 });
  }

  await revokeTeamMemberAccess(id, target.role as InviteTeamRole);

  const termEmail = await sendTeamTerminatedEmail({
    to: target.email,
    name: target.full_name || target.email,
  });

  await logFreightAction({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "team.terminate",
    entityType: "tms_user",
    entityId: id,
    meta: { email: target.email, role: target.role },
  });

  return NextResponse.json({ ok: true, emailSent: termEmail.ok });
}
