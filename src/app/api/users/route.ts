import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { logFreightAction } from "@/lib/freight/audit-log";
import { PUBLIC_SITE_URL } from "@/lib/freight/constants";
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

  // Revoke any pending invite for this email and issue a fresh 7-day token (driver-style flow).
  await db
    .from("dispatcher_invitations")
    .update({ status: "revoked" })
    .eq("invitee_email", emailNorm)
    .eq("status", "pending");

  const token = crypto.randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { error: inviteErr } = await db.from("dispatcher_invitations").insert({
    invited_by: auth.user.id,
    invitee_email: emailNorm,
    invitee_name: body.full_name?.trim() || null,
    team_role: teamRole,
    token,
    status: "pending",
    expires_at: expiresAt,
  });

  if (inviteErr) {
    console.error("[users/invite] dispatcher_invitations", inviteErr);
    return NextResponse.json(
      {
        error:
          inviteErr.message.includes("does not exist")
            ? "Run supabase/dispatcher-invitations.sql in Supabase first."
            : inviteErr.message,
      },
      { status: 500 },
    );
  }

  const inviteUrl = `${PUBLIC_SITE_URL}/accept-invite/dispatcher?token=${encodeURIComponent(token)}`;

  const roleLabel = inviteRoleLabel(teamRole);
  const emailResult = await sendTeamInviteEmail({
    to: emailNorm,
    inviteeName: body.full_name?.trim() || emailNorm,
    roleLabel,
    inviterName: tmsDisplayName(auth.user),
    inviteUrl,
  });

  await logFreightAction({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "team.invite",
    entityType: "dispatcher_invitation",
    entityId: token,
    meta: { email: emailNorm, role: teamRole, expiresAt },
  });

  return NextResponse.json({
    ok: true,
    inviteUrl,
    emailSent: emailResult.ok,
    emailError: emailResult.ok
      ? undefined
      : emailResult.error ?? "SMTP not configured — set SMTP_* on Vercel",
    expiresAt,
    loginUrl: tmsLoginUrl(),
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

const patchSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(["dispatcher", "sub_dispatcher"]),
});

export async function PATCH(req: Request) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  let body: z.infer<typeof patchSchema>;
  try {
    body = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  if (body.id === auth.user.id) {
    return NextResponse.json({ error: "You cannot change your own role here." }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "DB not configured" }, { status: 503 });

  const { data: target } = await db
    .from("tms_users")
    .select("id, email, full_name, role, active")
    .eq("id", body.id)
    .maybeSingle();

  if (!target?.active) {
    return NextResponse.json({ error: "Team member not found" }, { status: 404 });
  }

  if (target.role !== "dispatcher" && target.role !== "sub_dispatcher") {
    return NextResponse.json({ error: "Only dispatch team roles can be changed." }, { status: 400 });
  }

  if (isSuperDispatcherEmail(target.email)) {
    return NextResponse.json({ error: "Cannot change super dispatcher role." }, { status: 400 });
  }

  const { data, error } = await db
    .from("tms_users")
    .update({ role: body.role, updated_at: new Date().toISOString() })
    .eq("id", body.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await syncSubDispatcherProfile(body.id, target.email, target.full_name);

  await logFreightAction({
    actorId: auth.user.id,
    actorEmail: auth.user.email,
    action: "team.role_change",
    entityType: "tms_user",
    entityId: body.id,
    meta: { email: target.email, from: target.role, to: body.role },
  });

  return NextResponse.json({ user: data });
}
