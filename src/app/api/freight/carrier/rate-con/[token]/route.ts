import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  acceptRateConfirmation,
  getPendingRateConByToken,
} from "@/lib/freight/rate-confirmations";
import { buildRateConfirmationPdf } from "@/lib/freight/rate-con-pdf";
import { listSuperDispatcherEmails } from "@/lib/tms/auth";
import { sendTransactionalEmailSafe } from "@/lib/freight/rate-con-emails";

type Ctx = { params: { token: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "rate-con-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const token = ctx.params.token?.trim();
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  const check = await getPendingRateConByToken(token);
  if (!check.ok) {
    const status =
      check.reason === "accepted" ? 409 : check.reason === "expired" ? 410 : 404;
    return NextResponse.json(
      {
        error:
          check.reason === "accepted"
            ? "Already signed"
            : check.reason === "expired"
              ? "This rate confirmation expired"
              : "Rate confirmation not found",
        reason: check.reason,
      },
      { status },
    );
  }

  return NextResponse.json({
    loadNumber: check.row.load_number,
    broker: check.row.broker,
    lane: check.row.lane,
    companyName: check.row.company_name,
    rateAmount: check.row.rate_amount,
    dispatchPercent: check.row.dispatch_percent,
    termsVersion: check.row.terms_version,
    expiresAt: check.row.expires_at,
  });
}

const acceptSchema = z.object({
  companyName: z.string().min(2).max(200).optional(),
  contactName: z.string().min(2).max(200),
  email: z.string().email().max(200),
  phone: z.string().min(7).max(40),
  agreed: z.literal(true),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "rate-con-accept", 12)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const token = ctx.params.token?.trim();
  if (!token || token.length < 16) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  try {
    const body = acceptSchema.parse(await req.json());
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip");
    const userAgent = req.headers.get("user-agent");

    const result = await acceptRateConfirmation({
      token,
      contactName: sanitizeText(body.contactName, 200),
      email: sanitizeText(body.email, 200),
      phone: sanitizeText(body.phone, 40),
      companyName: body.companyName
        ? sanitizeText(body.companyName, 200)
        : undefined,
      ip,
      userAgent,
    });

    if ("error" in result) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status ?? 400 },
      );
    }

    const { pdf, filename } = await buildRateConfirmationPdf({
      companyName: result.row.company_name || "",
      contactName: result.row.contact_name || "",
      email: result.row.signer_email || body.email,
      phone: result.row.signer_phone || body.phone,
      loadNumber: result.row.load_number,
      broker: result.row.broker,
      lane: result.row.lane,
      rateAmount: Number(result.row.rate_amount),
      dispatchPercent: result.row.dispatch_percent,
      termsVersion: result.row.terms_version,
      acceptedAt: result.row.accepted_at || new Date().toISOString(),
      acceptedIp: ip,
    });

    const supers = await listSuperDispatcherEmails();
    await Promise.all(
      supers.map((to) =>
        sendTransactionalEmailSafe({
          to,
          subject: `Rate confirmation signed — Load #${result.row.load_number || ""}`,
          html: `<p><strong>${sanitizeText(result.row.contact_name || "", 80)}</strong> signed RC for load <strong>${sanitizeText(result.row.load_number || "", 40)}</strong> (${sanitizeText(result.row.company_name || "", 80)}).</p>
            <p>Amount: $${Number(result.row.rate_amount).toFixed(2)}</p>
            <p>Signed PDF attached.</p>`,
          text: `RC signed for load ${result.row.load_number}`,
          attachments: [{ filename, content: pdf }],
        }).catch(() => {}),
      ),
    );

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid form" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
