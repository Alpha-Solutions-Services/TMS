import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import { buildCarrierAgreementPdf } from "@/lib/freight/carrier-agreement-pdf";
import {
  acceptCarrierAgreement,
  validateCarrierAgreementToken,
} from "@/lib/freight/carrier-agreements";
import {
  sendCarrierAgreementAcceptedSuperEmail,
  sendCarrierInvitationEmail,
} from "@/lib/freight/emails";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { listSuperDispatcherEmails } from "@/lib/tms/auth";

type Ctx = { params: { token: string } };

/** GET — public agreement payload for e-sign page (no PII until accept). */
export async function GET(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "carrier-agreement-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const token = ctx.params.token?.trim();
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  const check = await validateCarrierAgreementToken(token);
  if (!check.valid) {
    const status =
      check.reason === "accepted" ? 409 : check.reason === "expired" ? 410 : 404;
    return NextResponse.json(
      {
        error:
          check.reason === "accepted"
            ? "This agreement was already accepted"
            : check.reason === "expired"
              ? "This agreement link has expired"
              : check.reason === "revoked"
                ? "This agreement link was revoked"
                : "Agreement not found",
        reason: check.reason,
      },
      { status },
    );
  }

  return NextResponse.json({
    dispatchPercent: check.agreement.dispatch_percent,
    termsVersion: check.agreement.terms_version,
    expiresAt: check.agreement.expires_at,
    invitedEmail: check.agreement.invited_email,
  });
}

const acceptSchema = z.object({
  companyName: z.string().min(2).max(200),
  contactName: z.string().min(2).max(200),
  email: z.string().email().max(200),
  phone: z.string().min(7).max(40),
  agreed: z.literal(true),
});

/** POST — carrier accepts; creates invite + emails supers with PDF. */
export async function POST(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "carrier-agreement-accept", 12)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const token = ctx.params.token?.trim();
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  try {
    const body = acceptSchema.parse(await req.json());
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await acceptCarrierAgreement({
      token,
      companyName: sanitizeText(body.companyName, 200),
      contactName: sanitizeText(body.contactName, 200),
      email: sanitizeText(body.email, 200),
      phone: sanitizeText(body.phone, 40),
      ip,
      userAgent,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }

    const admin = getServiceRoleClient();
    const { data: inviter } = admin
      ? await admin
          .from("profiles")
          .select("full_name, email")
          .eq("id", result.createdBy)
          .maybeSingle()
      : { data: null };

    const inviterName =
      inviter?.full_name ?? inviter?.email ?? "Alpha Freight";

    await sendCarrierInvitationEmail({
      to: result.email,
      inviteeName: result.contactName,
      inviterName,
      inviteUrl: result.inviteUrl,
      requiresDocuments: result.requiresDocuments,
    }).catch(() => {});

    const { pdf, filename } = await buildCarrierAgreementPdf({
      input: {
        companyName: result.companyName,
        contactName: result.contactName,
        email: result.email,
        phone: result.phone,
        dispatchPercent: result.dispatchPercent,
        effectiveDate: new Date(result.acceptedAt).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        }),
      },
      acceptedAt: result.acceptedAt,
      acceptedIp: ip,
      inviteUrl: result.inviteUrl,
    });

    const supers = await listSuperDispatcherEmails();
    await Promise.all(
      supers.map((to) =>
        sendCarrierAgreementAcceptedSuperEmail({
          to,
          companyName: result.companyName,
          contactName: result.contactName,
          carrierEmail: result.email,
          carrierPhone: result.phone,
          dispatchPercent: result.dispatchPercent,
          inviteUrl: result.inviteUrl,
          acceptedAt: result.acceptedAt,
          pdf,
          pdfFilename: filename,
        }).catch((err) => {
          console.error("[agreement-accept] super email failed", to, err);
        }),
      ),
    );

    return NextResponse.json({
      ok: true,
      inviteUrl: result.inviteUrl,
      dispatchPercent: result.dispatchPercent,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
    }
    console.error("[carrier/agreement accept]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
