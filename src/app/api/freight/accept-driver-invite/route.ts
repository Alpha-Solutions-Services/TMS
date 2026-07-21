import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPasswordForEmail } from "@/lib/auth/verify-password-for-email";
import { deliverAuthNotifications } from "@/lib/email/auth-notify";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  brandedEmailWrap,
  createConfiguredTransporter,
  resolveSmtpFromAddress,
} from "@/lib/freight/email-transport";

const schema = z.object({
  token: z.string().min(10),
  fullName: z.string().min(2),
  phone: z.string().min(7),
  cdlNumber: z.string().min(5),
  cdlState: z.string().length(2),
  cdlExpiry: z.string().min(8),
  password: z.string().min(8),
});

export async function POST(req: NextRequest) {
  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "Server error" }, { status: 500 });

  try {
    const body = schema.parse(await req.json());
    const { data: invite } = await admin
      .from("driver_invitations")
      .select("*")
      .eq("token", body.token.trim())
      .maybeSingle();

    if (
      !invite ||
      invite.status !== "pending" ||
      new Date(invite.expires_at).getTime() < Date.now()
    ) {
      return NextResponse.json(
        { error: "This invitation link is invalid or has expired." },
        { status: 400 },
      );
    }

    const emailNorm = String(invite.driver_email).toLowerCase();
    const { data: emailExists } = await admin.rpc("check_freight_email_registered", {
      candidate: emailNorm,
    });

    let userId: string;
    let createdNewAuthUser = false;

    if (emailExists) {
      const verified = await verifyPasswordForEmail(emailNorm, body.password);
      if ("error" in verified) {
        return NextResponse.json(
          { error: verified.error },
          { status: verified.status },
        );
      }
      userId = verified.userId;

      const { data: existingProf } = await admin
        .from("profiles")
        .select("role, carrier_id")
        .eq("id", userId)
        .maybeSingle();

      const r = existingProf?.role;
      if (r === "student" || r === "dispatcher") {
        return NextResponse.json(
          {
            error: `This email is already a ${r} account. Use a different email for this driver invitation, or sign in with that role.`,
          },
          { status: 409 },
        );
      }
      if (r === "carrier") {
        return NextResponse.json(
          {
            error:
              "This email is registered as a carrier. Use a different email for your driver account.",
          },
          { status: 409 },
        );
      }
      if (
        r === "driver" &&
        existingProf?.carrier_id &&
        existingProf.carrier_id !== invite.carrier_id
      ) {
        return NextResponse.json(
          { error: "This email is already a driver for another carrier." },
          { status: 409 },
        );
      }
    } else {
      const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
        email: emailNorm,
        password: body.password,
        email_confirm: true,
        user_metadata: { role: "driver", full_name: body.fullName.trim() },
      });
      if (authErr || !authUser?.user?.id) {
        console.error("[accept-driver-invite] createUser", authErr);
        return NextResponse.json({ error: "Could not create account" }, { status: 500 });
      }
      userId = authUser.user.id;
      createdNewAuthUser = true;
    }

    const driverPayload = {
      email: emailNorm,
      full_name: body.fullName.trim(),
      phone: body.phone.trim(),
      role: "driver" as const,
      carrier_id: invite.carrier_id as string,
      enrollment_status: "unpaid" as const,
      carrier_status: "pending" as const,
      cdl_number: body.cdlNumber.trim(),
      cdl_state: body.cdlState.trim().toUpperCase(),
      cdl_expiry: body.cdlExpiry.slice(0, 10),
    };

    const { data: profRow } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    let profileErr: { message?: string } | null = null;
    if (profRow) {
      const { error } = await admin.from("profiles").update(driverPayload).eq("id", userId);
      profileErr = error;
    } else {
      const { error } = await admin
        .from("profiles")
        .insert({ id: userId, ...driverPayload });
      profileErr = error;
    }

    if (profileErr) {
      console.error("[accept-driver-invite] profile upsert", profileErr);
      if (createdNewAuthUser) {
        await admin.auth.admin.deleteUser(userId);
      }
      return NextResponse.json({ error: "Profile setup failed" }, { status: 500 });
    }

    await admin.auth.admin
      .updateUserById(userId, {
        user_metadata: { role: "driver", full_name: body.fullName.trim() },
      })
      .catch(() => {});

    await admin
      .from("driver_invitations")
      .update({ status: "accepted" })
      .eq("id", invite.id as string);

    const { data: inviter } = await admin
      .from("profiles")
      .select("email,full_name")
      .eq("id", invite.invited_by as string)
      .maybeSingle();
    const { data: newDriverSummary } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", userId)
      .maybeSingle();

    const transporter = createConfiguredTransporter();
    const smtpUser = process.env.SMTP_USER?.trim();
    if (transporter && smtpUser && inviter?.email) {
      const inner = brandedEmailWrap(
        "Driver enrolled",
        `<p>${newDriverSummary?.full_name ?? "A driver"} has accepted your Alpha Freight invitation.</p>`,
      );
      await transporter.sendMail({
        from: resolveSmtpFromAddress(`Alpha Solutions <${smtpUser}>`),
        to: inviter.email as string,
        subject: "Driver accepted Alpha Freight invitation",
        html: inner,
        text: `Driver ${body.fullName} accepted your Alpha Freight invitation.`,
      });
    }

    void deliverAuthNotifications({
      kind: "signup",
      userId,
      email: emailNorm,
      profileRole: "driver",
      detail: "Driver accepted invitation — account created.",
    }).catch(() => {});

    return NextResponse.json({ ok: true, userId });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[accept-driver-invite]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
