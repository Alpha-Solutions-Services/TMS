import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listPendingDispatchLoadApprovals,
  resolveDispatchLoadApproval,
} from "@/lib/freight/dispatch-load-approvals";
import {
  softDeleteDispatchLoad,
  updateDispatchLoad,
} from "@/lib/freight/dispatch-loads-db";
import { sendLoadAddedEmail } from "@/lib/freight/emails";
import { resolveLoadCarrierEmail } from "@/lib/freight/load-notifications";
import { requireSuperDispatcher } from "@/lib/tms/auth";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export const dynamic = "force-dynamic";

export async function GET() {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  const pending = await listPendingDispatchLoadApprovals();
  const admin = getServiceRoleClient();

  const loadIds = pending.map((p) => p.load_id).filter(Boolean) as string[];
  const loadMap = new Map<string, Record<string, unknown>>();

  if (admin && loadIds.length) {
    const { data } = await admin
      .from("dispatch_loads")
      .select("id, company_name, load_number, sr, status")
      .in("id", loadIds);
    for (const row of data ?? []) {
      loadMap.set(row.id as string, row as Record<string, unknown>);
    }
  }

  return NextResponse.json({
    approvals: pending.map((p) => ({
      ...p,
      load: p.load_id ? loadMap.get(p.load_id) ?? null : null,
    })),
  });
}

const postSchema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  reviewNote: z.string().max(500).optional(),
});

export async function POST(req: NextRequest) {
  const auth = await requireSuperDispatcher();
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const admin = getServiceRoleClient();
    if (!admin) {
      return NextResponse.json({ error: "Database unavailable" }, { status: 500 });
    }

    const { data: existing } = await admin
      .from("dispatch_load_approvals")
      .select("*")
      .eq("id", body.id)
      .eq("status", "pending")
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "Approval not found or already resolved" }, { status: 404 });
    }

    const approval = await resolveDispatchLoadApproval({
      id: body.id,
      status: body.decision,
      reviewedBy: auth.user.id,
      reviewNote: body.reviewNote,
    });

    if (!approval) {
      return NextResponse.json({ error: "Could not resolve approval" }, { status: 500 });
    }

    const payload = (approval.payload ?? {}) as Record<string, unknown>;
    const loadId = approval.load_id;

    if (body.decision === "approved" && loadId) {
      if (approval.action === "create") {
        await updateDispatchLoad(loadId, { status: "Unpaid" });
        const company = String(payload.companyName ?? "");
        const loadNo = String(payload.loadNumber ?? loadId.slice(0, 8));
        const email = resolveLoadCarrierEmail(payload.email as string | undefined);
        if (email) {
          await sendLoadAddedEmail({
            to: email,
            carrierName: company,
            loadNumber: loadNo,
            broker: String(payload.broker ?? ""),
            pickup: String(payload.pickupDateTime ?? ""),
          }).catch(() => {});
        }
      } else if (approval.action === "update") {
        const { id: _omit, ...patch } = payload as { id?: string } & Record<string, unknown>;
        await updateDispatchLoad(loadId, patch);
      } else if (approval.action === "delete") {
        await softDeleteDispatchLoad(loadId);
      }
    }

    if (body.decision === "rejected" && loadId && approval.action === "create") {
      await softDeleteDispatchLoad(loadId);
    }

    return NextResponse.json({ ok: true, approval });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[dispatcher/approvals POST]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
