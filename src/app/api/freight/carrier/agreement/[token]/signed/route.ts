import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/freight/api-security";
import { getAcceptedCarrierAgreementByToken } from "@/lib/freight/carrier-agreements";

type Ctx = { params: { token: string } };

/** GET — public signed-record payload (accepted agreements only). */
export async function GET(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "carrier-agreement-signed", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const token = ctx.params.token?.trim();
  if (!token || token.length < 20) {
    return NextResponse.json({ error: "Invalid link" }, { status: 400 });
  }

  const result = await getAcceptedCarrierAgreementByToken(token);
  if (!result.ok) {
    const status = result.reason === "not_accepted" ? 409 : 404;
    return NextResponse.json(
      {
        error:
          result.reason === "not_accepted"
            ? "This agreement has not been signed yet"
            : "Signed agreement not found",
      },
      { status },
    );
  }

  const a = result.agreement;
  return NextResponse.json({
    companyName: a.company_name,
    contactName: a.contact_name,
    email: a.carrier_email,
    phone: a.carrier_phone,
    dispatchPercent: a.dispatch_percent,
    termsVersion: a.terms_version,
    acceptedAt: a.accepted_at,
    acceptedIp: a.accepted_ip,
  });
}
