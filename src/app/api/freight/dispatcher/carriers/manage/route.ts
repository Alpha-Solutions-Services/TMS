import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sanitizeText } from "@/lib/freight/api-security";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const patchSchema = z.object({
  carrierProfileId: z.string().uuid(),
  companyName: z.string().min(1).max(200).optional(),
  fullName: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  mcNumber: z.string().max(40).optional(),
  dotNumber: z.string().max(40).optional(),
  companyAddress: z.string().max(500).optional(),
  carrierStatus: z.enum(["verified", "suspended", "pending"]).optional(),
  billingMode: z.enum(["standard", "free"]).optional(),
  billingNote: z.string().max(500).optional(),
  extendTrialDays: z.number().int().min(0).max(365).optional(),
});

async function requireDispatcher() {
  const sb = await createClient();
  if (!sb) return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (!(await assertDispatcher(user.id))) {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }

  return { user };
}

export async function GET() {
  const auth = await requireDispatcher();
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("profiles")
    .select(
      "id,email,full_name,company_name,phone,mc_number,dot_number,company_address,carrier_status,carrier_subscription_status,carrier_trial_ends_at,carrier_billing_mode,carrier_billing_note,created_at",
    )
    .eq("role", "carrier")
    .order("company_name", { ascending: true });

  if (error) {
    console.error("[carriers/manage GET]", error);
    return NextResponse.json({ error: "Could not load carriers" }, { status: 500 });
  }

  return NextResponse.json({ carriers: data ?? [] });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  try {
    const body = patchSchema.parse(await req.json());
    const row: Record<string, unknown> = {};

    if (body.companyName !== undefined) {
      row.company_name = sanitizeText(body.companyName, 200);
    }
    if (body.fullName !== undefined) row.full_name = sanitizeText(body.fullName, 200);
    if (body.phone !== undefined) row.phone = sanitizeText(body.phone, 40);
    if (body.mcNumber !== undefined) row.mc_number = sanitizeText(body.mcNumber, 40);
    if (body.dotNumber !== undefined) row.dot_number = sanitizeText(body.dotNumber, 40);
    if (body.companyAddress !== undefined) {
      row.company_address = sanitizeText(body.companyAddress, 500);
    }
    if (body.carrierStatus !== undefined) row.carrier_status = body.carrierStatus;
    if (body.billingMode !== undefined) {
      row.carrier_billing_mode = body.billingMode;
      if (body.billingMode === "free") {
        row.carrier_subscription_status = "active";
      }
    }
    if (body.billingNote !== undefined) {
      row.carrier_billing_note = sanitizeText(body.billingNote, 500);
    }
    if (body.extendTrialDays !== undefined && body.extendTrialDays > 0) {
      const d = new Date();
      d.setDate(d.getDate() + body.extendTrialDays);
      row.carrier_trial_ends_at = d.toISOString();
      row.carrier_subscription_status = "trialing";
      row.carrier_billing_mode = "standard";
    }

    if (Object.keys(row).length === 0) {
      return NextResponse.json({ error: "No fields to update" }, { status: 400 });
    }

    const { error } = await admin
      .from("profiles")
      .update(row)
      .eq("id", body.carrierProfileId)
      .eq("role", "carrier");

    if (error) {
      console.error("[carriers/manage PATCH]", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
