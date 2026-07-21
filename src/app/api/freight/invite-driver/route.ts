import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { z } from "zod";
import { sendDriverAddedToCarrierEmail, sendDriverInvitationEmail } from "@/lib/freight/emails";
import { PUBLIC_SITE_URL } from "@/lib/freight/constants";
import { createClient } from "@/lib/supabase/server";
import { requireCanInviteCarriersAndDrivers } from "@/lib/tms/auth";

const schema = z.object({
  driverName: z.string().min(2),
  driverEmail: z.string().email(),
  /** Required when dispatcher sends */
  carrierId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = schema.parse(await req.json());
    const { data: inviter } = await sb
      .from("profiles")
      .select(
        "id, role, carrier_status, company_name, full_name",
      )
      .eq("id", user.id)
      .maybeSingle();

    if (!inviter) return NextResponse.json({ error: "Profile missing" }, { status: 403 });

    let carrierUuid: string;
    let inviterRole: "carrier" | "dispatcher";
    let inviterDisplay: string;

    if (inviter.role === "carrier") {
      if (inviter.carrier_status !== "verified") {
        return NextResponse.json(
          { error: "Verified carriers only" },
          { status: 403 },
        );
      }
      carrierUuid = inviter.id;
      inviterRole = "carrier";
      inviterDisplay =
        typeof inviter.company_name === "string" && inviter.company_name.trim()
          ? inviter.company_name.trim()
          : inviter.full_name ?? "Your carrier";
    } else if (inviter.role === "dispatcher") {
      const auth = await requireCanInviteCarriersAndDrivers();
      if ("error" in auth) return auth.error;
      if (!body.carrierId) {
        return NextResponse.json({ error: "carrierId required" }, { status: 400 });
      }
      carrierUuid = body.carrierId;
      inviterRole = "dispatcher";
      inviterDisplay = inviter.full_name ?? "Alpha Freight Dispatcher";
      const { data: car } = await sb
        .from("profiles")
        .select("carrier_status")
        .eq("id", carrierUuid)
        .eq("role", "carrier")
        .maybeSingle();
      if (!car || car.carrier_status !== "verified") {
        return NextResponse.json(
          { error: "Carrier not verified or not found" },
          { status: 400 },
        );
      }
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: carrier } = await sb
      .from("profiles")
      .select("company_name,full_name,id")
      .eq("id", carrierUuid)
      .maybeSingle();
    const carrierName =
      (carrier?.company_name as string)?.trim() ||
      (carrier?.full_name as string) ||
      "Carrier";

    const token = crypto.randomBytes(24).toString("hex"); // 48 hex chars ≥ 32
    const { error } = await sb.from("driver_invitations").insert({
      invited_by: inviter.id,
      inviter_role: inviterRole,
      driver_email: body.driverEmail.trim().toLowerCase(),
      driver_name: body.driverName.trim(),
      carrier_id: carrierUuid,
      token,
    });
    if (error) {
      console.error("[invite-driver]", error);
      return NextResponse.json({ error: "Could not create invite" }, { status: 500 });
    }

    const inviteUrl = `${PUBLIC_SITE_URL}/accept-invite/driver?token=${encodeURIComponent(token)}`;
    await sendDriverInvitationEmail(
      body.driverEmail.trim().toLowerCase(),
      body.driverName.trim(),
      inviterDisplay,
      carrierName,
      inviteUrl,
    ).catch(() => {});

    const { data: carrierProfile } = await sb
      .from("profiles")
      .select("email")
      .eq("id", carrierUuid)
      .maybeSingle();
    if (carrierProfile?.email) {
      await sendDriverAddedToCarrierEmail({
        to: carrierProfile.email as string,
        carrierName,
        driverName: body.driverName.trim(),
        driverEmail: body.driverEmail.trim().toLowerCase(),
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[invite-driver]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
