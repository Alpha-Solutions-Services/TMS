import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/freight/api-security";
import { buildCarrierAgreementPdf } from "@/lib/freight/carrier-agreement-pdf";
import {
  buildCarrierAgreementSignedUrl,
  getAcceptedCarrierAgreementByToken,
} from "@/lib/freight/carrier-agreements";
import { createClient } from "@/lib/supabase/server";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageCarrierAgreements } from "@/lib/tms/permissions";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

type Ctx = { params: { id: string } };

/** GET — download signed agreement PDF (dispatcher / super). */
export async function GET(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "dispatcher-agreement-pdf", 30)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await resolveTmsRole(user);
  if (!canManageCarrierAgreements(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data: row, error } = await admin
    .from("tms_carrier_agreements")
    .select(
      "id, token, status, created_by, dispatch_percent, company_name, contact_name, carrier_email, carrier_phone, accepted_at, accepted_ip, terms_version",
    )
    .eq("id", ctx.params.id)
    .maybeSingle();

  if (error || !row) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (role === "dispatcher" && row.created_by !== user.id) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (row.status !== "accepted") {
    return NextResponse.json(
      { error: "Agreement is not signed yet" },
      { status: 409 },
    );
  }

  // Confirm via token helper for consistent shape
  const accepted = await getAcceptedCarrierAgreementByToken(row.token as string);
  if (!accepted.ok) {
    return NextResponse.json({ error: "Signed record unavailable" }, { status: 404 });
  }

  const a = accepted.agreement;
  const { pdf, filename } = await buildCarrierAgreementPdf({
    input: {
      companyName: a.company_name,
      contactName: a.contact_name,
      email: a.carrier_email,
      phone: a.carrier_phone,
      dispatchPercent: a.dispatch_percent,
      effectiveDate: new Date(a.accepted_at).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    },
    acceptedAt: a.accepted_at,
    acceptedIp: a.accepted_ip,
    signedUrl: buildCarrierAgreementSignedUrl(a.token),
  });

  return new NextResponse(new Uint8Array(pdf), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
