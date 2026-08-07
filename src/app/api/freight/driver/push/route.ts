import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { getVapidPublicKey } from "@/lib/freight/driver-push";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({
    p256dh: z.string().min(1),
    auth: z.string().min(1),
  }),
});

/** GET — public VAPID key for driver push subscribe */
export async function GET() {
  const key = getVapidPublicKey();
  if (!key) {
    return NextResponse.json({ enabled: false, publicKey: null });
  }
  return NextResponse.json({ enabled: true, publicKey: key });
}

/** POST — save driver push subscription */
export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "driver-push-sub", 20)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || profile.role !== "driver") {
    return NextResponse.json({ error: "Driver only" }, { status: 403 });
  }

  try {
    const body = subSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

    const { error } = await admin.from("tms_driver_push_subscriptions").upsert(
      {
        driver_profile_id: user.id,
        endpoint: body.endpoint,
        p256dh: body.keys.p256dh,
        auth: body.keys.auth,
        user_agent: req.headers.get("user-agent")?.slice(0, 240) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "endpoint" },
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
