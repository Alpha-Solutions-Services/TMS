import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPasswordForEmail } from "@/lib/auth/verify-password-for-email";
import {
  uploadRequiredCarrierDocumentsFromFormData,
  type CarrierPaymentPreference,
} from "@/lib/freight/carrier-documents";
import {
  acceptCarrierInvite,
  validateCarrierInviteToken,
} from "@/lib/freight/carrier-invitations";
import { sendCarrierPendingEmail } from "@/lib/freight/emails";
import {
  lookupCarrierByMcDocket,
  normalizeMcNumber,
  summarizeFmcsCarrier,
} from "@/lib/freight/fmcsa";
import {
  captureCarrierRegistrationSnapshot,
  rollbackFailedCarrierRegistration,
  type CarrierRegistrationProfileSnapshot,
} from "@/lib/freight/rollback-carrier-registration";
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
  carrierPaymentPreference: z.enum(["factoring", "quick_pay"]).optional(),
});

export async function POST(req: NextRequest) {
  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role not configured" }, {
      status: 500,
    });
  }

  try {
    const form = await req.formData();
    const body = schema.parse({
      email: String(form.get("email") ?? ""),
      password: String(form.get("password") ?? ""),
      contactName: String(form.get("contactName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      mcNumber: String(form.get("mcNumber") ?? ""),
      companyName: String(form.get("companyName") ?? ""),
      companyAddress: String(form.get("companyAddress") ?? ""),
      allowManualVerification: form.get("allowManualVerification") === "true",
      carrierPaymentPreference: (() => {
        const v = String(form.get("carrierPaymentPreference") ?? "").trim();
        return v === "" ? undefined : v;
      })(),
    });
    const normalizedMc = normalizeMcNumber(body.mcNumber);
    const emailNorm = body.email.trim().toLowerCase();
    const inviteToken = String(form.get("inviteToken") ?? "").trim() || null;
    let docsRequired = true;
    let assignedDispatcherId: string | null = null;

    if (inviteToken) {
      const inviteCtx = await validateCarrierInviteToken(inviteToken);
      if (!inviteCtx.valid) {
        return NextResponse.json(
          { error: "Invite link invalid or expired" },
          { status: 400 },
        );
      }
      if (emailNorm !== inviteCtx.invitedEmail) {
        return NextResponse.json(
          { error: "Email must match the invited address on this link" },
          { status: 400 },
        );
      }
      docsRequired = inviteCtx.requiresDocuments;
      assignedDispatcherId = inviteCtx.assignedDispatcherId;
    }

    const preferenceRaw = body.carrierPaymentPreference;
    if (docsRequired && !preferenceRaw) {
      return NextResponse.json(
        { error: "Payment preference required" },
        { status: 400 },
      );
    }
    const preference = preferenceRaw as CarrierPaymentPreference | undefined;

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
    let profileInserted = false;
    let priorSnapshot: CarrierRegistrationProfileSnapshot | null = null;

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
      carrier_payment_preference: docsRequired ? preference ?? null : null,
      carrier_documents_required: docsRequired,
      assigned_dispatcher_id: assignedDispatcherId,
    } as const;

    const { data: existingProfileByUser } = await admin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (existingProfileByUser) {
      priorSnapshot = await captureCarrierRegistrationSnapshot(admin, userId);
    }

    let profErr: { message?: string } | null = null;
    if (existingProfileByUser) {
      const { error } = await admin.from("profiles").update(baseProfile).eq("id", userId);
      profErr = error;
    } else {
      const { error } = await admin.from("profiles").insert({ id: userId, ...baseProfile });
      profErr = error;
      if (!error) profileInserted = true;
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

    if (docsRequired && preference) {
      const docs = await uploadRequiredCarrierDocumentsFromFormData({
        carrierProfileId: userId,
        preference,
        form,
      });
      if ("error" in docs) {
        console.error("[register-carrier] docs", docs.error);
        await rollbackFailedCarrierRegistration({
          admin,
          userId,
          createdNewAuthUser,
          profileInserted,
          priorSnapshot,
        });
        return NextResponse.json(
          {
            error: `${docs.error} Registration was not completed — please try again from the start.`,
          },
          { status: 400 },
        );
      }
    }

    if (inviteToken) {
      const accepted = await acceptCarrierInvite({
        token: inviteToken,
        profileId: userId,
      });
      if ("error" in accepted) {
        console.error("[register-carrier] invite accept", accepted.error);
      }
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

    await deliverAuthNotifications({
      kind: "signup",
      userId,
      email: emailNorm,
      profileRole: "carrier",
      detail: "Carrier registered (email + password).",
    });

    return NextResponse.json({ ok: true, userId, fmcsaVerified });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[register-carrier]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
