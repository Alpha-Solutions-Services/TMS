import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import {
  type CarrierPortalConfig,
  fetchCarrierPortalConfig,
  upsertCarrierPortalConfig,
} from "@/lib/freight/carrier-portal-db";
import { sendPortalConfigUpdatedEmail } from "@/lib/freight/emails";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
  companyName: z.string().min(1).max(200),
  carrierProfileId: z.string().uuid().optional(),
  portalConfig: z.record(z.string(), z.unknown()),
});

export async function GET(req: NextRequest) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const companyName = req.nextUrl.searchParams.get("companyName")?.trim();
  const carrierProfileId = req.nextUrl.searchParams.get("carrierProfileId")?.trim();

  if (!companyName && !carrierProfileId) {
    return NextResponse.json({ error: "companyName or carrierProfileId required" }, { status: 400 });
  }

  const portalConfig = await fetchCarrierPortalConfig({
    companyName: companyName ?? "",
    carrierProfileId: carrierProfileId ?? undefined,
  });

  return NextResponse.json({ portalConfig: portalConfig ?? {} });
}

export async function POST(req: NextRequest) {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const ok = await upsertCarrierPortalConfig({
      companyName: body.companyName,
      carrierProfileId: body.carrierProfileId,
      portalConfig: body.portalConfig as CarrierPortalConfig,
      updatedBy: user.id,
    });

    if (!ok) {
      return NextResponse.json({ error: "Could not save portal config" }, { status: 500 });
    }

    const admin = getServiceRoleClient();
    let carrierEmail: string | null = null;
    if (admin && body.carrierProfileId) {
      const { data } = await admin
        .from("profiles")
        .select("email")
        .eq("id", body.carrierProfileId)
        .maybeSingle();
      carrierEmail = (data?.email as string) || null;
    }

    if (carrierEmail) {
      await sendPortalConfigUpdatedEmail({
        to: carrierEmail,
        carrierName: body.companyName,
        dispatcherName: user.email ?? "Dispatch",
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
