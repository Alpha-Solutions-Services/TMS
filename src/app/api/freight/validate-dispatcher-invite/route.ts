import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) return NextResponse.json({ error: "token required" }, { status: 400 });

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const { data: invite, error } = await admin
    .from("dispatcher_invitations")
    .select("id, invitee_email, invitee_name, team_role, expires_at, status, invited_by")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) return NextResponse.json({ valid: false });

  const expired =
    invite.status !== "pending" ||
    new Date(invite.expires_at as string).getTime() < Date.now();

  if (expired) {
    await admin
      .from("dispatcher_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id as string);
    return NextResponse.json({ valid: false, reason: "expired" });
  }

  const { data: inviter } = await admin
    .from("profiles")
    .select("full_name, email")
    .eq("id", invite.invited_by as string)
    .maybeSingle();

  const roleLabel =
    invite.team_role === "sub_dispatcher" ? "Sub Dispatcher" : "Dispatcher";

  return NextResponse.json({
    valid: true,
    inviteeEmail: invite.invitee_email as string,
    inviteeName: (invite.invitee_name as string | null) ?? "",
    teamRole: invite.team_role as string,
    roleLabel,
    inviterName: inviter?.full_name ?? inviter?.email ?? "Super Dispatcher",
    expiresAt: invite.expires_at as string,
  });
}
