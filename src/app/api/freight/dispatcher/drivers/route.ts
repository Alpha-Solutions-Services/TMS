import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const driverSchema = z.object({
  driverName: z.string().min(2),
  driverEmail: z.string().email().optional().or(z.literal("")),
  driverPhone: z.string().optional(),
  carrierCompanyName: z.string().min(1),
  carrierRosterId: z.string().uuid().optional(),
  carrierProfileId: z.string().uuid().optional(),
  notes: z.string().optional(),
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

export async function POST(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  try {
    const body = driverSchema.parse(await req.json());
    const { data, error } = await admin
      .from("dispatch_driver_roster")
      .insert({
        created_by: auth.user.id,
        driver_name: body.driverName.trim(),
        driver_email: body.driverEmail || null,
        driver_phone: body.driverPhone || null,
        carrier_company_name: body.carrierCompanyName.trim(),
        carrier_roster_id: body.carrierRosterId || null,
        carrier_profile_id: body.carrierProfileId || null,
        notes: body.notes || null,
      })
      .select("id")
      .single();

    if (error) {
      console.error("[drivers POST]", error);
      return NextResponse.json({ error: "Could not add driver" }, { status: 500 });
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
  const auth = await requireDispatcher();
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  const { error } = await admin
    .from("dispatch_driver_roster")
    .update({ active: false })
    .eq("id", id);

  if (error) {
    console.error("[drivers DELETE]", error);
    return NextResponse.json({ error: "Could not remove driver" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
