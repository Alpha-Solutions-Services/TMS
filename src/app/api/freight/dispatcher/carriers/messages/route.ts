import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import { assertDispatcher, resolveDispatcherTmsRole } from "@/lib/freight/dispatch-roster";
import { sendDispatcherMessageToCarrierEmail } from "@/lib/freight/emails";
import { PUBLIC_SITE_URL } from "@/lib/freight/constants";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { canChatWithCarriers } from "@/lib/tms/permissions";
import type { TmsRole } from "@/lib/tms/roles";

const postSchema = z.object({
  carrierProfileId: z.string().uuid(),
  message: z.string().max(4000).optional(),
  attachments: z
    .array(
      z.object({
        name: z.string(),
        url: z.string().url(),
        mime: z.string(),
      }),
    )
    .max(5)
    .optional(),
});

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-messages", 40)) {
    return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }

  const sb = await createClient();
  if (!sb) return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (!(await assertDispatcher(user))) {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }

  const role = (await resolveDispatcherTmsRole(user)) as TmsRole;
  if (!canChatWithCarriers(role)) {
    return {
      error: NextResponse.json(
        { error: "Sub dispatchers cannot chat with carriers" },
        { status: 403 },
      ),
    };
  }

  const { data: me } = await sb
    .from("profiles")
    .select("full_name,email")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user,
    displayName: (me?.full_name as string) || user.email || "Dispatcher",
  };
}

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  const carrierId = req.nextUrl.searchParams.get("carrierProfileId");
  if (!carrierId) {
    return NextResponse.json({ error: "carrierProfileId required" }, { status: 400 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("dispatch_carrier_messages")
    .select("id,created_at,sender_role,body,attachments,read_at")
    .eq("carrier_profile_id", carrierId)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Could not load messages" }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const text = sanitizeText(body.message ?? "", 4000);
    const attachments = body.attachments ?? [];
    if (!text && attachments.length === 0) {
      return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
    }

    const { data: carrier } = await admin
      .from("profiles")
      .select("email,company_name,full_name")
      .eq("id", body.carrierProfileId)
      .eq("role", "carrier")
      .maybeSingle();

    if (!carrier?.email) {
      return NextResponse.json({ error: "Carrier not found" }, { status: 404 });
    }

    const { error } = await admin.from("dispatch_carrier_messages").insert({
      carrier_profile_id: body.carrierProfileId,
      sender_profile_id: auth.user.id,
      sender_role: "dispatcher",
      body: text || `[${attachments.length} attachment(s)]`,
      attachments,
    });

    if (error) {
      console.error("[carriers/messages POST]", error);
      return NextResponse.json({ error: "Could not send message" }, { status: 500 });
    }

    const carrierName =
      (carrier.company_name as string)?.trim() ||
      (carrier.full_name as string) ||
      "Carrier";

    await sendDispatcherMessageToCarrierEmail({
      to: carrier.email as string,
      carrierName,
      dispatcherName: auth.displayName,
      message: text,
      portalUrl: `${PUBLIC_SITE_URL}/carrier/chat`,
    }).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
