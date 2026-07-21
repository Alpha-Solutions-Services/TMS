import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const postSchema = z.object({
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

export async function GET() {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("role,carrier_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "carrier" || profile.carrier_status !== "verified") {
    return NextResponse.json({ error: "Verified carrier only" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ error: "DB unavailable" }, { status: 500 });

  const { data, error } = await admin
    .from("dispatch_carrier_messages")
    .select("id,created_at,sender_role,body,attachments")
    .eq("carrier_profile_id", user.id)
    .order("created_at", { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: "Could not load messages" }, { status: 500 });
  }

  return NextResponse.json({ messages: data ?? [] });
}

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-messages", 20)) {
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
    .select("role,carrier_status")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "carrier" || profile.carrier_status !== "verified") {
    return NextResponse.json({ error: "Verified carrier only" }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const text = sanitizeText(body.message ?? "", 4000);
    const attachments = body.attachments ?? [];
    if (!text && attachments.length === 0) {
      return NextResponse.json({ error: "Message or attachment required" }, { status: 400 });
    }

    const { error } = await sb.from("dispatch_carrier_messages").insert({
      carrier_profile_id: user.id,
      sender_profile_id: user.id,
      sender_role: "carrier",
      body: text || `[${attachments.length} attachment(s)]`,
      attachments,
    });

    if (error) {
      return NextResponse.json({ error: "Could not send message" }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
