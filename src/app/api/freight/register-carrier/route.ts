import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPasswordForEmail } from "@/lib/auth/verify-password-for-email";
import { sendCarrierPendingEmail } from "@/lib/freight/emails";
import {
  lookupCarrierByMcDocket,
  normalizeMcNumber,
  summarizeFmcsCarrier,
} from "@/lib/freight/fmcsa";
import { deliverAuthNotifications } from "@/lib/email/auth-notify";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  contactName: z.string().min(2),
  phone: z.string().min(7),
  mcNumber: z.string().min(1),
  companyName: z.string().min(2),
  companyAddress: z.string().min(5).optional().or(z.literal("")),
  allowManualVerification: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, {
      status: 500,
    });
  }

  try {
    const body = schema.parse(await req.json());
    const normalizedMc = normalizeMcNumber(body.mcNumber);
    const emailNorm = body.email.trim().toLowerCase();

    const { data: emailExists } = await admin.rpc("check_freight_email_registered", {
      candidate: emailNorm,
    });

    let userId: string | undefined;

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
        .select("role, mc_number")
        .eq("id", userId)
        .maybeSingle();

      const r = existingProf?.role;
      if (r === "student" || r === "dispatcher" || r === "driver") {
        return NextResponse.json(
          {
            error: `This email is already a ${r} account. Sign in with the ${r} option, or use a different email to register as a carrier.`,
          },
          { status: 409 },
        );
      }
      if (r === "carrier" && existingProf?.mc_number) {
        return NextResponse.json(
          { error: "This carrier account is already registered. Sign in instead." },
          { status: 409 },
        );
      }
    }

    const { data: existingMc } = await admin
      .from("profiles")
      .select("id")
      .eq("mc_number", normalizedMc)
      .maybeSingle();
    if (existingMc && existingMc.id !== userId) {
      return NextResponse.json(
        { error: "This MC number is already registered." },
        { status: 409 },
      );
    }

    let fmcsaVerified = false;
    let fmcsData: Record<string, unknown> | null = null;
    let companyName = body.companyName.trim();
    let companyAddress = (body.companyAddress ?? "").trim();
    let dotNumber: string | undefined;

    const webKey = process.env.FMCSA_API_KEY?.trim();
    const allowManual = Boolean(body.allowManualVerification);

    if (!webKey) {
      if (!allowManual) {
        return NextResponse.json(
          {
            error:
              "FMCSA is not configured server-side — submit again with manual verification enabled after reviewing your company details.",
            needsManualAck: true,
          },
          { status: 422 },
        );
      }
      fmcsaVerified = false;
      fmcsData = null;
    } else if (webKey) {
      const looked = await lookupCarrierByMcDocket(normalizedMc, webKey);

      if (looked.ok) {
        const summary = summarizeFmcsCarrier(looked.carrier, emailNorm);
        if (!summary.emailMatched || !summary.active) {
          return NextResponse.json(
            {
              error:
                "MC verification mismatch. Restart registration with corrected FMCSA data.",
            },
            { status: 422 },
          );
        }
        fmcsData = looked.carrier;
        fmcsaVerified = true;
        companyName = summary.companyName;
        companyAddress = summary.mailingAddress;
        dotNumber = summary.dotNumber;
      } else if (looked.reason === "not_found") {
        return NextResponse.json(
          {
            error:
              "MC number not found in FMCSA database. Please check your number.",
          },
          { status: 404 },
        );
      } else if (allowManual) {
        fmcsaVerified = false;
        fmcsData = null;
      } else {
        return NextResponse.json(
          {
            error:
              "FMCSA lookup failed temporarily. Retry, or acknowledge manual verification.",
            retry: true,
          },
          { status: 503 },
        );
      }
    }

    let createdNewAuthUser = false;
    if (!emailExists) {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: emailNorm,
          password: body.password,
          email_confirm: true,
          user_metadata: { role: "carrier", contact_name: body.contactName.trim() },
        });

      if (createErr || !created.user) {
        console.error("[register-carrier] createUser", createErr);
        return NextResponse.json(
          { error: "Unable to create account" },
          { status: 500 },
        );
      }

      userId = created.user.id;
      createdNewAuthUser = true;
    }

    if (!userId) {
      return NextResponse.json({ error: "Unable to create account" }, { status: 500 });
    }

    const baseProfile = {
      email: emailNorm,
      full_name: body.contactName.trim(),
      phone: body.phone.trim(),
      role: "carrier",
      mc_number: normalizedMc,
      dot_number: dotNumber ?? null,
      company_name: companyName,
      company_address: companyAddress || null,
      carrier_status: "pending",
      fmcsa_verified: fmcsaVerified,
      fmcsa_verified_at: fmcsaVerified ? new Date().toISOString() : null,
      fmcsa_data: fmcsData,
      enrollment_status: "unpaid",
    } as const;

    const { data: existingProfileByUser } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    let profErr: { message?: string } | null = null;
    if (existingProfileByUser) {
      const { error } = await admin.from("profiles").update(baseProfile).eq("id", userId);
      profErr = error;
    } else {
      const { error } = await admin.from("profiles").insert({ id: userId, ...baseProfile });
      profErr = error;
    }

    if (profErr) {
      console.error("[register-carrier] profile", profErr);
      if (createdNewAuthUser) {
        await admin.auth.admin.deleteUser(userId);
      }
      return NextResponse.json(
        { error: "Unable to finalize registration right now. Please try again." },
        { status: 500 },
      );
    }

    await admin.auth.admin
      .updateUserById(userId, {
        user_metadata: { role: "carrier", contact_name: body.contactName.trim() },
      })
      .catch(() => {});

    await sendCarrierPendingEmail(
      emailNorm,
      companyName || "Carrier",
      normalizedMc,
    ).catch(() => {});

    void deliverAuthNotifications({
      kind: "signup",
      userId,
      email: emailNorm,
      profileRole: "carrier",
      detail: "Carrier registered (email + password).",
    }).catch(() => {});

    return NextResponse.json({ ok: true, userId, fmcsaVerified });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[register-carrier]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
