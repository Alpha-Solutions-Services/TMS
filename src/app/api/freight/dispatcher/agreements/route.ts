import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  buildCarrierAgreementUrl,
  createCarrierAgreement,
  revokeCarrierAgreement,
} from "@/lib/freight/carrier-agreements";
import {
  CARRIER_AGREEMENT_PERCENT_MAX,
  CARRIER_AGREEMENT_PERCENT_MIN,
  clampAgreementPercent,
} from "@/lib/freight/carrier-agreement-terms";
import { sendCarrierAgreementLinkEmail } from "@/lib/freight/emails";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageCarrierAgreements } from "@/lib/tms/permissions";

const postSchema = z.object({
  dispatchPercent: z
    .number()
    .min(CARRIER_AGREEMENT_PERCENT_MIN)
    .max(CARRIER_AGREEMENT_PERCENT_MAX),
  invitedEmail: z.string().email().optional(),
  requiresDocuments: z.boolean().optional(),
  sendEmail: z.boolean().optional(),
  assignedDispatcherId: z.string().uuid().nullable().optional(),
});

const revokeSchema = z.object({
  id: z.string().uuid(),
});

async function requireAgreementsActor(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-agreements", 40)) {
    return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }

  const sb = await createClient();
  if (!sb) {
    return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const role = await resolveTmsRole(user);
  if (!canManageCarrierAgreements(role)) {
    return {
      error: NextResponse.json(
        { error: "Dispatcher or super dispatcher only" },
        { status: 403 },
      ),
    };
  }

  return { user, role };
}

/** GET — list recent agreements */
export async function GET(req: NextRequest) {
  const auth = await requireAgreementsActor(req);
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  let query = admin
    .from("tms_carrier_agreements")
    .select(
      "id, invited_email, dispatch_percent, requires_documents, token, status, expires_at, terms_version, company_name, contact_name, carrier_email, carrier_phone, accepted_at, created_at, created_by",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (auth.role === "dispatcher") {
    query = query.eq("created_by", auth.user.id);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[dispatcher/agreements] list", error);
    return NextResponse.json({ error: "Could not load agreements" }, { status: 500 });
  }

  const agreements = (data ?? []).map((row) => ({
    ...row,
    dispatch_percent: Number(row.dispatch_percent),
    agreementUrl: buildCarrierAgreementUrl(row.token as string),
  }));

  return NextResponse.json({ agreements });
}

/** POST — create agreement link (optionally email carrier) */
export async function POST(req: NextRequest) {
  const auth = await requireAgreementsActor(req);
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const percent = clampAgreementPercent(body.dispatchPercent);

    const created = await createCarrierAgreement({
      createdBy: auth.user.id,
      dispatchPercent: percent,
      invitedEmail: body.invitedEmail
        ? sanitizeText(body.invitedEmail, 200)
        : undefined,
      requiresDocuments: body.requiresDocuments,
      assignedDispatcherId:
        auth.role === "dispatcher" ? auth.user.id : body.assignedDispatcherId ?? null,
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }

    const admin = getServiceRoleClient();
    const { data: inviter } = admin
      ? await admin
          .from("profiles")
          .select("full_name, email")
          .eq("id", auth.user.id)
          .maybeSingle()
      : { data: null };

    const inviterName =
      inviter?.full_name ?? inviter?.email ?? auth.user.email ?? "Alpha Freight";

    if (body.sendEmail !== false && body.invitedEmail) {
      await sendCarrierAgreementLinkEmail({
        to: body.invitedEmail.trim().toLowerCase(),
        inviterName,
        agreementUrl: created.agreementUrl,
        dispatchPercent: created.dispatchPercent,
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      agreementUrl: created.agreementUrl,
      token: created.token,
      dispatchPercent: created.dispatchPercent,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: `Invalid payload — dispatch % must be ${CARRIER_AGREEMENT_PERCENT_MIN}–${CARRIER_AGREEMENT_PERCENT_MAX}`,
        },
        { status: 400 },
      );
    }
    console.error("[dispatcher/agreements] POST", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

/** PATCH — revoke pending agreement */
export async function PATCH(req: NextRequest) {
  const auth = await requireAgreementsActor(req);
  if ("error" in auth) return auth.error;

  try {
    const body = revokeSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    }

    if (auth.role === "dispatcher") {
      const { data: row } = await admin
        .from("tms_carrier_agreements")
        .select("id, created_by, status")
        .eq("id", body.id)
        .maybeSingle();
      if (!row || row.created_by !== auth.user.id) {
        return NextResponse.json({ error: "Not found" }, { status: 404 });
      }
    }

    const result = await revokeCarrierAgreement({
      id: body.id,
      actorId: auth.user.id,
    });
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
