import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  buildLoadTrackUrl,
  createLoadShareLink,
  normalizeZipLast4,
} from "@/lib/freight/load-share-links";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

const postSchema = z.object({
  loadId: z.string().uuid(),
  zip: z.string().min(4).max(20),
  label: z.string().max(120).optional(),
  expiresInDays: z.number().int().min(1).max(60).optional(),
});

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-share-links", 40)) {
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
  return { user, role };
}

/** GET ?loadId= — list share links for a load */
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
    .from("tms_load_share_links")
    .select("id, token, zip_last4, label, expires_at, revoked_at, created_at")
    .eq("load_id", loadId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: "Could not load links" }, { status: 500 });
  }

  return NextResponse.json({
    links: (data ?? []).map((row) => ({
      ...row,
      trackUrl: buildLoadTrackUrl(row.token as string),
    })),
  });
}

/** POST — create public tracking link */
export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const zip = normalizeZipLast4(body.zip);
    if (!zip) {
      return NextResponse.json({ error: "Invalid ZIP" }, { status: 400 });
    }

    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
    }

    const { data: load } = await admin
      .from("dispatch_loads")
      .select("id")
      .eq("id", body.loadId)
      .is("deleted_at", null)
      .maybeSingle();

    if (!load) {
      return NextResponse.json({ error: "Load not found" }, { status: 404 });
    }

    const created = await createLoadShareLink({
      loadId: body.loadId,
      zipLast4: zip,
      createdBy: auth.user.id,
      label: body.label ? sanitizeText(body.label, 120) : undefined,
      expiresInDays: body.expiresInDays,
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }

    return NextResponse.json({
      ok: true,
      id: created.id,
      trackUrl: created.trackUrl,
      token: created.token,
      zipLast4: zip,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
