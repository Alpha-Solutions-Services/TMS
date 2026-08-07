import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  createAnnouncement,
  listActiveAnnouncements,
  softDeleteAnnouncement,
} from "@/lib/freight/announcements";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isDispatcherRole } from "@/lib/tms/roles";

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-announcements", 40)) {
    return {
      error: NextResponse.json({ error: "Too many requests" }, { status: 429 }),
    };
  }
  const sb = await createClient();
  if (!sb) {
    return {
      error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }),
    };
  }
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  const role = await resolveTmsRole(user);
  if (!isDispatcherRole(role)) {
    return {
      error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }),
    };
  }
  return { user };
}

/** GET — list announcements (active + recent) */
export async function GET(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("tms_announcements")
    .select("id, title, body, audience, starts_at, ends_at, created_at, deleted_at")
    .is("deleted_at", null)
    .order("starts_at", { ascending: false })
    .limit(40);

  if (error) {
    return NextResponse.json({ error: "Could not load" }, { status: 500 });
  }

  return NextResponse.json({
    announcements: data ?? [],
    active: await listActiveAnnouncements("all"),
  });
}

const postSchema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(4000),
  audience: z.enum(["carrier", "dispatcher", "all"]).default("carrier"),
  endsAt: z.string().datetime().optional().nullable(),
});

/** POST — create announcement */
export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const created = await createAnnouncement({
      title: sanitizeText(body.title, 160),
      body: sanitizeText(body.body, 4000),
      audience: body.audience,
      createdBy: auth.user.id,
      endsAt: body.endsAt ?? null,
    });
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, announcement: created.row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

const deleteSchema = z.object({ id: z.string().uuid() });

/** DELETE — soft-delete announcement */
export async function DELETE(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = deleteSchema.parse(await req.json());
    const result = await softDeleteAnnouncement(body.id);
    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
