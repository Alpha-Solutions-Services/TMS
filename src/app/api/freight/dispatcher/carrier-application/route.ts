import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  carrierRequiredDocumentsApproved,
  type CarrierPaymentPreference,
} from "@/lib/freight/carrier-documents";
import { startCarrierTrialIso } from "@/lib/freight/carrier-subscription";
import { sendCarrierApprovedEmail, sendCarrierRejectedEmail } from "@/lib/freight/emails";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

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

  const tmsRole = await resolveTmsRole(user);
  if (!isDispatcherRole(tmsRole)) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  try {
    const body = schema.parse(await req.json());
    const { data: target } = await admin
      .from("profiles")
      .select("id,role,email,company_name,full_name,carrier_status")
      .eq("id", body.carrierProfileId)
      .eq("role", "carrier")
      .maybeSingle();

    if (!target?.email) {
      return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
    }

    if (body.decision === "approve") {
      const { data: prefRow } = await admin
        .from("profiles")
        .select("carrier_payment_preference, carrier_documents_required")
        .eq("id", body.carrierProfileId)
        .maybeSingle();
      const docsRequired = prefRow?.carrier_documents_required !== false;
      if (docsRequired) {
        const ready = await carrierRequiredDocumentsApproved(
          body.carrierProfileId,
          prefRow?.carrier_payment_preference as
            | CarrierPaymentPreference
            | null,
        );
        if (!ready) {
          return NextResponse.json(
            {
              error:
                "Cannot verify carrier until MC, W-9, COI, and pay document are all approved.",
            },
            { status: 400 },
          );
        }
      }
    }

    const nextStatus =
      body.decision === "approve" ? "verified" : "rejected";

    const { error } = await admin
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
