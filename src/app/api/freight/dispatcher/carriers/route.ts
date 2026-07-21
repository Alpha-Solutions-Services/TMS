import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { requireSuperDispatcher } from "@/lib/tms/auth";

const carrierSchema = z.object({
  mc: z.string().optional(),
  mcAge: z.string().optional(),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  companyName: z.string().min(1),
  truck: z.string().optional(),
  email: z.union([z.string().email(), z.literal("")]).optional(),
  address: z.string().optional(),
  dotNumber: z.string().optional(),
  insuranceExpiresAt: z.string().optional(),
  w9OnFile: z.boolean().optional(),
  dispatchReview: z.string().optional(),
  status: z.string().optional(),
  salesReview: z.string().optional(),
  salesAttention: z.string().optional(),
  documentLink: z.union([z.string().url(), z.literal("")]).optional(),
});

async function requireDispatcher() {
  const sb = await createClient();
  if (!sb) return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (!(await assertDispatcher(user))) {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }

  return { user };
}

export async function POST(req: NextRequest) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  try {
    const body = carrierSchema.parse(await req.json());
    const { data, error } = await admin
      .from("dispatch_carrier_roster")
      .insert({
        created_by: auth.user.id,
        mc: body.mc || null,
        mc_age: body.mcAge || null,
        contact_name: body.contactName || null,
        phone: body.phone || null,
        company_name: body.companyName.trim(),
        truck: body.truck || null,
        email: body.email || null,
        address: body.address || null,
        dot_number: body.dotNumber || null,
        insurance_expires_at: body.insuranceExpiresAt || null,
        w9_on_file: body.w9OnFile ?? false,
        dispatch_review: body.dispatchReview || null,
        status: body.status || "Active",
        sales_review: body.salesReview || null,
        sales_attention: body.salesAttention || null,
        document_link: body.documentLink || null,
        source: "dispatcher",
      })
      .select("id")
      .single();

    if (error) {
      console.error("[carriers POST]", error);
      return NextResponse.json({ error: "Could not add carrier" }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data.id });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  const { error } = await admin
    .from("dispatch_carrier_roster")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    console.error("[carriers DELETE]", error);
    return NextResponse.json({ error: "Could not remove carrier" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
