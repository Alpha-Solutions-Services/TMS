import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { startCarrierTrialIso } from "@/lib/freight/carrier-subscription";
import { sendCarrierApprovedEmail, sendCarrierRejectedEmail } from "@/lib/freight/emails";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  carrierProfileId: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  reason: z.string().max(2000).optional(),
});

export async function POST(req: NextRequest) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || me.role !== "dispatcher") {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  try {
    const body = schema.parse(await req.json());
    const { data: target } = await sb
      .from("profiles")
      .select("id,role,email,company_name,full_name")
      .eq("id", body.carrierProfileId)
      .eq("role", "carrier")
      .maybeSingle();

    if (!target?.email) {
      return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
    }

    const nextStatus =
      body.decision === "approve" ? "verified" : "rejected";

    const { error } = await sb
      .from("profiles")
      .update({
        carrier_status: nextStatus,
        carrier_review_note:
          body.decision === "reject" ? (body.reason ?? "No reason supplied") : null,
        ...(body.decision === "approve"
          ? {
              carrier_subscription_status: "trialing",
              carrier_trial_ends_at: startCarrierTrialIso(),
            }
          : {}),
      })
      .eq("id", body.carrierProfileId)
      .eq("role", "carrier");

    if (error) {
      console.error("[carrier-application]", error);
      return NextResponse.json({ error: "Update failed" }, { status: 500 });
    }

    const name =
      (target.company_name as string)?.trim?.() ??
      ((target.full_name as string) || "Carrier");
    const em = target.email as string;

    if (body.decision === "approve") {
      await sendCarrierApprovedEmail(em, name).catch(() => {});
    } else {
      await sendCarrierRejectedEmail(
        em,
        name,
        body.reason ?? "Please contact freight support for detail.",
      ).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }
    console.error("[carrier-application]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
