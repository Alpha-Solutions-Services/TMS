import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isOwnerUser, isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import {
  createNotification,
  findUserIdByEmail,
  notifyOpsInApp,
} from "@/lib/notifications";
import { getPortalUrl } from "@/lib/supabase/env";
import { notifyUser, escapeHtml } from "@/lib/email/notify";

async function requireStaff() {
  const session = await getSessionUser();
  if ("error" in session) return { error: session.error };
  if (!(await isPortalStaff(session.user))) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}

export async function GET(req: NextRequest) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ deals: [] });

  const stage = req.nextUrl.searchParams.get("stage");
  let q = db
    .from("portal_deals")
    .select("*, quotes:portal_quotes(*)")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (stage) q = q.eq("stage", stage);
  const { data } = await q;
  return NextResponse.json({ deals: data ?? [] });
}

const createSchema = z.object({
  title: z.string().min(2).max(200),
  clientEmail: z.string().email(),
  clientName: z.string().max(200).optional(),
  serviceSlug: z.string().max(100).optional(),
  stage: z
    .enum([
      "inquiry",
      "qualified",
      "quoted",
      "negotiation",
      "won",
      "lost",
      "on_hold",
    ])
    .optional(),
  estimatedValue: z.number().nonnegative().optional(),
  inquiryId: z.string().uuid().optional().nullable(),
  notes: z.string().max(5000).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const clientUserId = await findUserIdByEmail(parsed.clientEmail);

  const { data, error } = await db
    .from("portal_deals")
    .insert({
      title: parsed.title,
      client_email: parsed.clientEmail,
      client_name: parsed.clientName || null,
      client_user_id: clientUserId,
      service_slug: parsed.serviceSlug || null,
      stage: parsed.stage || "inquiry",
      estimated_value: parsed.estimatedValue ?? null,
      inquiry_id: parsed.inquiryId || null,
      notes: parsed.notes || null,
      owner_email: auth.session.user.email,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[deals POST]", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  if (clientUserId) {
    await createNotification({
      userId: clientUserId,
      title: "New opportunity started",
      body: parsed.title,
      href: `${getPortalUrl()}/dashboard?tab=quotes`,
      email: parsed.clientEmail,
    });
  }

  return NextResponse.json({ ok: true, deal: data });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  stage: z
    .enum([
      "inquiry",
      "qualified",
      "quoted",
      "negotiation",
      "won",
      "lost",
      "on_hold",
    ])
    .optional(),
  estimatedValue: z.number().nonnegative().optional().nullable(),
  lossReason: z.string().max(1000).optional().nullable(),
  winNotes: z.string().max(2000).optional().nullable(),
  notes: z.string().max(5000).optional().nullable(),
  title: z.string().min(2).max(200).optional(),
  projectId: z.string().uuid().optional().nullable(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (parsed.stage !== undefined) updates.stage = parsed.stage;
  if (parsed.estimatedValue !== undefined)
    updates.estimated_value = parsed.estimatedValue;
  if (parsed.lossReason !== undefined) updates.loss_reason = parsed.lossReason;
  if (parsed.winNotes !== undefined) updates.win_notes = parsed.winNotes;
  if (parsed.notes !== undefined) updates.notes = parsed.notes;
  if (parsed.title !== undefined) updates.title = parsed.title;
  if (parsed.projectId !== undefined) updates.project_id = parsed.projectId;

  const { data, error } = await db
    .from("portal_deals")
    .update(updates)
    .eq("id", parsed.id)
    .select("*")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }

  if (parsed.stage === "won" || parsed.stage === "lost") {
    void notifyOpsInApp({
      title: `Deal ${parsed.stage}: ${data.title}`,
      body: data.client_email as string,
      href: `${getPortalUrl()}/admin?tab=pipeline`,
    });
    if (data.client_email) {
      void notifyUser({
        email: data.client_email as string,
        subject: `Update on ${data.title}`,
        title: "Pipeline update",
        html: `<p>Your opportunity <strong>${escapeHtml(String(data.title))}</strong> is now <strong>${parsed.stage}</strong>.</p>`,
      });
    }
  }

  return NextResponse.json({ ok: true, deal: data });
}

export async function DELETE(req: NextRequest) {
  const auth = await requireStaff();
  if ("error" in auth) return auth.error;
  if (!isOwnerUser(auth.session.user)) {
    return NextResponse.json(
      { error: "Only owners can delete deals" },
      { status: 403 }
    );
  }
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });
  await db.from("portal_deals").delete().eq("id", id);
  return NextResponse.json({ ok: true });
}
