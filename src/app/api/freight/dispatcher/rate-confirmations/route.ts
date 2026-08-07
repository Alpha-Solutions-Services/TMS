import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  buildRateConUrl,
  createRateConfirmation,
} from "@/lib/freight/rate-confirmations";
import { sendTransactionalEmailSafe } from "@/lib/freight/rate-con-emails";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

const postSchema = z.object({
  loadId: z.string().uuid(),
  sendEmail: z.boolean().optional(),
  toEmail: z.string().email().optional(),
});

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-rate-cons", 40)) {
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
  if (!isDispatcherRole(role)) {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }
  return { user };
}

/** GET ?loadId= list rate cons for load */
export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  const loadId = req.nextUrl.searchParams.get("loadId");
  if (!loadId) {
    return NextResponse.json({ error: "loadId required" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("tms_rate_confirmations")
    .select(
      "id, token, status, rate_amount, dispatch_percent, load_number, company_name, signer_email, accepted_at, expires_at, created_at",
    )
    .eq("load_id", loadId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Could not load rate cons" }, { status: 500 });
  }

  return NextResponse.json({
    rateCons: (data ?? []).map((row) => ({
      ...row,
      rate_amount: Number(row.rate_amount),
      url: buildRateConUrl(row.token as string),
    })),
  });
}

/** POST — create rate confirmation from load */
export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    }

    const { data: load, error: loadErr } = await admin
      .from("dispatch_loads")
      .select(
        "id, load_number, company_name, broker, states, rc_invoice, dispatch_percent, email, carrier_profile_id",
      )
      .eq("id", body.loadId)
      .is("deleted_at", null)
      .maybeSingle();

    if (loadErr || !load) {
      return NextResponse.json({ error: "Load not found" }, { status: 404 });
    }

    const created = await createRateConfirmation({
      loadId: load.id as string,
      createdBy: auth.user.id,
      rateAmount: Number(load.rc_invoice) || 0,
      dispatchPercent:
        load.dispatch_percent == null ? null : Number(load.dispatch_percent),
      loadNumber: (load.load_number as string) || undefined,
      broker: (load.broker as string) || undefined,
      lane: (load.states as string) || undefined,
      companyName: (load.company_name as string) || undefined,
      carrierProfileId: (load.carrier_profile_id as string) || null,
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }

    const to =
      body.toEmail?.trim().toLowerCase() ||
      (typeof load.email === "string" ? load.email.trim().toLowerCase() : "");

    if (body.sendEmail !== false && to) {
      await sendTransactionalEmailSafe({
        to,
        subject: `Rate confirmation — Load #${load.load_number || ""}`,
        html: `<p>Please review and e-sign the rate confirmation for load <strong>${sanitizeText(String(load.load_number || ""), 40)}</strong>.</p>
          <p><a href="${created.url}" style="display:inline-block;padding:12px 20px;background:#38a3ff;color:#05080f;border-radius:10px;font-weight:700;text-decoration:none">Sign rate confirmation</a></p>`,
        text: `Sign rate confirmation: ${created.url}`,
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      url: created.url,
      token: created.token,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[rate-confirmations POST]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
