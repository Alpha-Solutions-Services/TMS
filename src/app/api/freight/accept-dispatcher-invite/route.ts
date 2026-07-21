import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPasswordForEmail } from "@/lib/auth/verify-password-for-email";
import { deliverAuthNotifications } from "@/lib/email/auth-notify";
import { syncSubDispatcherProfile } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const schema = z.object({
  token: z.string().min(10),
  fullName: z.string().min(2),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Server error" }, { status: 500 });

  try {
    const body = schema.parse(await req.json());
    const { data: invite } = await admin
      .from("dispatcher_invitations")
      .select("*")
      .eq("token", body.token.trim())
      .maybeSingle();

    if (
      !invite ||
      invite.status !== "pending" ||
      new Date(invite.expires_at as string).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "This invitation link is invalid or has expired (links last 7 days)." },
        { status: 400 },
      );
    }

    const emailNorm = String(invite.invitee_email).toLowerCase();
    const teamRole = invite.team_role as "dispatcher" | "sub_dispatcher";

    const { data: emailExists } = await admin.rpc("check_freight_email_registered", {
      candidate: emailNorm,
    });

    let userId: string;
    let createdNewAuthUser = false;

    if (emailExists) {
      const verified = await verifyPasswordForEmail(emailNorm, body.password);
      if ("error" in verified) {
        return NextResponse.json({ error: verified.error }, { status: verified.status });
      }
      userId = verified.userId;
    } else {
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: emailNorm,
        password: body.password,
        email_confirm: true,
        user_metadata: { role: "dispatcher", full_name: body.fullName.trim() },
      });
      if (authErr || !authUser?.user?.id) {
        console.error("[accept-dispatcher-invite] createUser", authErr);
        return NextResponse.json({ error: "Could not create account" }, { status: 500 });
      }
      userId = authUser.user.id;
      createdNewAuthUser = true;
    }

    const { error: tmsErr } = await admin.from("tms_users").upsert(
      {
        id: userId,
        email: emailNorm,
        full_name: body.fullName.trim(),
        role: teamRole,
        active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );

    if (tmsErr) {
      console.error("[accept-dispatcher-invite] tms_users", tmsErr);
      if (createdNewAuthUser) await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: "Could not provision team account" }, { status: 500 });
    }

    const profileSync = await syncSubDispatcherProfile(userId, emailNorm, body.fullName);
    if (!profileSync.ok) {
      if (createdNewAuthUser) await admin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileSync.error }, { status: 500 });
    }

    await admin
      .from("dispatcher_invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id as string);

    void deliverAuthNotifications({
      kind: "signup",
      userId,
      email: emailNorm,
      profileRole: "dispatcher",
      detail: `${teamRole} accepted invitation.`,
    }).catch(() => {});

    return NextResponse.json({ ok: true, userId, email: emailNorm });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[accept-dispatcher-invite]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
