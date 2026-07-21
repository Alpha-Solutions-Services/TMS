import { NextRequest, NextResponse } from "next/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Server error" }, { status: 500 });

  const { data: invite, error } = await admin
    .from("driver_invitations")
    .select("id,driver_email,driver_name,expires_at,status,carrier_id,invited_by")
    .eq("token", token)
    .maybeSingle();

  if (error || !invite) {
    return NextResponse.json({ valid: false });
  }

  const expired =
    invite.status !== "pending" ||
    new Date(invite.expires_at as string).getTime() < Date.now();

  if (expired) {
    await admin
      .from("driver_invitations")
      .update({ status: "expired" })
      .eq("id", invite.id as string);

    return NextResponse.json({ valid: false });
  }

  const { data: carrier } = await admin
    .from("profiles")
    .select("company_name,full_name")
    .eq("id", invite.carrier_id as string)
    .maybeSingle();

  const { data: inviter } = await admin
    .from("profiles")
    .select("full_name,company_name")
    .eq("id", invite.invited_by as string)
    .maybeSingle();

  const carrierName =
    carrier?.company_name?.trim?.() ?? carrier?.full_name ?? "Carrier";
  const inviterName =
    inviter?.company_name?.trim?.() ||
    inviter?.full_name ||
    "Your dispatcher";

  return NextResponse.json({
    valid: true,
    driverName: invite.driver_name as string | null,
    driverEmail: invite.driver_email as string,
    carrierName,
    inviterName,
    carrierId: invite.carrier_id as string,
    invitationId: invite.id as string,
  });
}
