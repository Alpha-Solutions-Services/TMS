import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  createCarrierInvitation,
  buildCarrierInviteUrl,
} from "@/lib/freight/carrier-invitations";
import { sendCarrierInvitationEmail } from "@/lib/freight/emails";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { resolveTmsRole } from "@/lib/tms/auth";
import { canManageCarriersRoster } from "@/lib/tms/permissions";

const postSchema = z.object({
  invitedEmail: z.string().email(),
  inviteeName: z.string().max(200).optional(),
  requiresDocuments: z.boolean(),
  assignedDispatcherId: z.string().uuid().nullable().optional(),
  sendEmail: z.boolean().optional(),
});

/** GET — list pending carrier invites (super only, D3) */
export async function GET() {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await resolveTmsRole(user);
  if (!canManageCarriersRoster(role)) {
    return NextResponse.json({ error: "Super dispatcher only" }, { status: 403 });
  }

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "DB unavailable" }, { status: 500 });
  }

  const { data, error } = await admin
    .from("tms_carrier_invitations")
    .select(
      "id, invited_email, invitee_name, requires_documents, token, status, expires_at, created_at",
    )
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    console.error("[dispatcher/carrier-invitations] list", error);
    return NextResponse.json({ error: "Could not load invites" }, { status: 500 });
  }

  const invitations = (data ?? []).map((row) => ({
    ...row,
    inviteUrl: buildCarrierInviteUrl(row.token as string),
  }));

  return NextResponse.json({ invitations });
}

/** POST — create carrier invite (super only, D3) */
export async function POST(req: NextRequest) {
  const sb = await createClient();
  if (!sb) {
    return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });
  }

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = await resolveTmsRole(user);
  if (!canManageCarriersRoster(role)) {
    return NextResponse.json({ error: "Super dispatcher only" }, { status: 403 });
  }

  try {
    const body = postSchema.parse(await req.json());
    const created = await createCarrierInvitation({
      invitedBy: user.id,
      invitedEmail: body.invitedEmail,
      inviteeName: body.inviteeName,
      requiresDocuments: body.requiresDocuments,
      assignedDispatcherId: body.assignedDispatcherId ?? null,
    });

    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }

    const admin = getServiceRoleClient();
    const { data: inviter } = admin
      ? await admin
          .from("profiles")
          .select("full_name, email")
          .eq("id", user.id)
          .maybeSingle()
      : { data: null };

    const inviterName =
      inviter?.full_name ?? inviter?.email ?? user.email ?? "Alpha Freight";

    if (body.sendEmail !== false) {
      await sendCarrierInvitationEmail({
        to: body.invitedEmail.trim().toLowerCase(),
        inviteeName: body.inviteeName ?? "",
        inviterName,
        inviteUrl: created.inviteUrl,
        requiresDocuments: body.requiresDocuments,
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      inviteUrl: created.inviteUrl,
      token: created.token,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[dispatcher/carrier-invitations]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
