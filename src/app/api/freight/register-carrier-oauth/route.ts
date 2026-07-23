import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
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
  contactName: z.string().min(2),
  phone: z.string().min(7),
  mcNumber: z.string().min(1),
  companyName: z.string().min(2),
  companyAddress: z.string().min(5).optional().or(z.literal("")),
  allowManualVerification: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const admin = getServiceRoleClient();
  if (!url || !anon || !admin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());
    const normalizedMc = normalizeMcNumber(body.mcNumber);
    const emailNorm = body.email.trim().toLowerCase();

    if ((user.email ?? "").toLowerCase() !== emailNorm) {
      return NextResponse.json(
        { error: "Signed-in email must match the FMCSA email you entered." },
        { status: 422 },
      );
    }

    const { data: existingProfile } = await admin
      .from("profiles")
      .select("id, mc_number")
      .eq("id", user.id)
      .maybeSingle();

    if (existingProfile?.mc_number) {
      return NextResponse.json({ error: "Carrier profile already registered." }, { status: 409 });
    }

    const { data: existingMc } = await admin
      .from("profiles")
      .select("id")
      .eq("mc_number", normalizedMc)
      .maybeSingle();
    if (existingMc && existingMc.id !== user.id) {
      return NextResponse.json({ error: "This MC number is already registered." }, { status: 409 });
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
    } else {
      const looked = await lookupCarrierByMcDocket(normalizedMc, webKey);
      if (looked.ok) {
        const summary = summarizeFmcsCarrier(looked.carrier, emailNorm);
        if (!summary.emailMatched || !summary.active) {
          return NextResponse.json(
            { error: "MC verification mismatch. Restart registration with corrected FMCSA data." },
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
          { error: "MC number not found in FMCSA database. Please check your number." },
          { status: 404 },
        );
      } else if (allowManual) {
        fmcsaVerified = false;
        fmcsData = null;
      } else {
        return NextResponse.json(
          {
            error: "FMCSA lookup failed temporarily. Retry, or acknowledge manual verification.",
            retry: true,
          },
          { status: 503 },
        );
      }
    }

    // Insert or update profile for this existing auth user.
    const base = {
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

    if (!existingProfile) {
      const { error: profErr } = await admin.from("profiles").insert({ id: user.id, ...base });
      if (profErr) {
        return NextResponse.json({ error: "Unable to finalize registration" }, { status: 500 });
      }
    } else {
      const { error: profErr } = await admin.from("profiles").update(base).eq("id", user.id);
      if (profErr) {
        return NextResponse.json({ error: "Unable to finalize registration" }, { status: 500 });
      }
    }

    await admin.auth.admin
      .updateUserById(user.id, { user_metadata: { role: "carrier", contact_name: body.contactName.trim() } })
      .catch(() => {});

    await sendCarrierPendingEmail(emailNorm, companyName || "Carrier", normalizedMc).catch(() => {});

    await deliverAuthNotifications({
      kind: "login",
      userId: user.id,
      email: emailNorm,
      profileRole: "carrier",
      detail: "Carrier completed MC registration (Google OAuth).",
    });

    return NextResponse.json({ ok: true, userId: user.id, fmcsaVerified });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[register-carrier-oauth]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

