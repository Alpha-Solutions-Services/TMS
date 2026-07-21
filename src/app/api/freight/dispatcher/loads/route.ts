import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit } from "@/lib/freight/api-security";
import { assertDispatcher, resolveDispatcherTmsRole } from "@/lib/freight/dispatch-roster";
import { insertDispatchLoadApproval } from "@/lib/freight/dispatch-load-approvals";
import {
  insertDispatchLoad,
  softDeleteDispatchLoad,
  updateDispatchLoad,
} from "@/lib/freight/dispatch-loads-db";
import {
  sendLoadActionDispatcherEmail,
  sendLoadAddedEmail,
  sendLoadAssignedToDriverEmail,
  sendLoadDriverAssignedCarrierEmail,
  sendLoadRemovedEmail,
  sendLoadUpdatedEmail,
  sendSubDispatcherApprovalRequestEmail,
} from "@/lib/freight/emails";
import { resolveProfileEmail, resolveProfileName } from "@/lib/freight/load-documents";
import {
  notifyDispatchRecipients,
  resolveLoadCarrierEmail,
} from "@/lib/freight/load-notifications";
import { resolveActiveMonthTab } from "@/lib/freight/dispatch-sheet-tabs";
import { ensureLoadChatThread } from "@/lib/freight/load-chat-thread";
import { createClient } from "@/lib/supabase/server";
import { listSuperDispatcherEmails } from "@/lib/tms/auth";
import { requiresSuperApproval } from "@/lib/tms/permissions";
import type { TmsRole } from "@/lib/tms/roles";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const loadFieldsSchema = z.object({
  monthTab: z.string().min(3).max(40).optional(),
  companyName: z.string().min(1).max(200),
  bookedBy: z.string().max(120).optional(),
  rcDate: z.string().max(40).optional(),
  truckTrailer: z.string().max(120).optional(),
  broker: z.string().max(200).optional(),
  loadDetails: z.string().max(500).optional(),
  pickupDateTime: z.string().max(120).optional(),
  deliveryDateTime: z.string().max(120).optional(),
  miles: z.number().min(0).max(99999).optional(),
  loadNumber: z.string().max(80).optional(),
  states: z.string().max(80).optional(),
  rcInvoice: z.number().min(0).max(9999999).optional(),
  dispatchPercent: z.number().min(0).max(100).optional(),
  dispatchFee: z.number().min(0).max(9999999).optional(),
  invoice: z.string().max(40).optional(),
  received: z.number().min(0).optional(),
  balance: z.number().min(0).optional(),
  notes: z.string().max(500).optional(),
  claim: z.string().max(200).optional(),
  status: z.string().max(40).optional(),
  cpay: z.string().max(80).optional(),
  dtp: z.string().max(80).optional(),
  brokerAgentName: z.string().max(120).optional(),
  email: z.string().max(200).optional(),
  phone: z.string().max(40).optional(),
  carrierProfileId: z.string().uuid().optional(),
  assignedDriverProfileId: z.string().uuid().nullable().optional(),
});

const createSchema = loadFieldsSchema;
const patchSchema = loadFieldsSchema.partial().extend({
  id: z.string().uuid(),
});

async function requireDispatcher(req: NextRequest) {
  if (!checkRateLimit(req, "dispatcher-loads", 60)) {
    return { error: NextResponse.json({ error: "Too many requests" }, { status: 429 }) };
  }

  const sb = await createClient();
  if (!sb) return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  if (!(await assertDispatcher(user.id))) {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }

  const role = (await resolveDispatcherTmsRole(user.id)) as TmsRole;

  return { user, role };
}

async function notifySuperApprovers(opts: {
  action: "create" | "update" | "delete";
  requestedByEmail?: string | null;
  companyName: string;
  loadNumber: string;
}): Promise<void> {
  const supers = await listSuperDispatcherEmails();
  await Promise.all(
    supers.map((to) =>
      sendSubDispatcherApprovalRequestEmail({
        to,
        action: opts.action,
        requestedByEmail: opts.requestedByEmail ?? "sub-dispatcher",
        companyName: opts.companyName,
        loadNumber: opts.loadNumber,
      }).catch(() => {}),
    ),
  );
}

async function notifyCarrierIfEmail(opts: {
  loadEmail?: string;
  carrierName: string;
  loadNumber: string;
  broker?: string;
  pickup?: string;
  kind: "added" | "updated" | "removed";
}): Promise<boolean> {
  const to = resolveLoadCarrierEmail(opts.loadEmail);
  if (!to) return false;

  if (opts.kind === "added") {
    await sendLoadAddedEmail({
      to,
      carrierName: opts.carrierName,
      loadNumber: opts.loadNumber,
      broker: opts.broker ?? "",
      pickup: opts.pickup ?? "",
    });
  } else if (opts.kind === "updated") {
    await sendLoadUpdatedEmail({
      to,
      carrierName: opts.carrierName,
      loadNumber: opts.loadNumber,
      broker: opts.broker ?? "",
      pickup: opts.pickup ?? "",
    });
  } else {
    await sendLoadRemovedEmail({
      to,
      carrierName: opts.carrierName,
      loadNumber: opts.loadNumber,
    });
  }
  return true;
}

async function notifyDispatchLoadAction(opts: {
  actorEmail?: string | null;
  action: "added" | "removed" | "updated";
  loadNumber: string;
  carrierName: string;
}): Promise<boolean> {
  let sent = false;
  await notifyDispatchRecipients(opts.actorEmail, async (to) => {
    await sendLoadActionDispatcherEmail({
      to,
      action: opts.action,
      loadNumber: opts.loadNumber,
      carrierName: opts.carrierName,
      actorEmail: opts.actorEmail ?? "dispatcher",
    });
    sent = true;
  });
  return sent;
}

export async function POST(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = createSchema.parse(await req.json());
    const monthTab = body.monthTab?.trim() || resolveActiveMonthTab();
    const needsApproval = requiresSuperApproval(auth.role);
    const loadStatus = needsApproval ? "Pending Approval" : body.status ?? "Unpaid";

    const result = await insertDispatchLoad(
      {
        monthTab,
        companyName: body.companyName,
        bookedBy: body.bookedBy ?? auth.user.email ?? "Dispatcher",
        rcDate: body.rcDate,
        truckTrailer: body.truckTrailer,
        broker: body.broker,
        loadDetails: body.loadDetails,
        pickupDateTime: body.pickupDateTime,
        deliveryDateTime: body.deliveryDateTime,
        miles: body.miles,
        loadNumber: body.loadNumber,
        states: body.states,
        rcInvoice: body.rcInvoice,
        dispatchPercent: body.dispatchPercent ?? 5,
        dispatchFee: body.dispatchFee,
        invoice: body.invoice,
        received: body.received,
        balance: body.balance,
        notes: body.notes,
        claim: body.claim,
        status: loadStatus,
        cpay: body.cpay,
        dtp: body.dtp,
        brokerAgentName: body.brokerAgentName,
        email: body.email,
        phone: body.phone,
        carrierProfileId: body.carrierProfileId,
        assignedDriverProfileId: body.assignedDriverProfileId ?? undefined,
      },
      auth.user.id,
    );

    if (!result) {
      return NextResponse.json({ error: "Could not save load" }, { status: 500 });
    }

    const loadNo = body.loadNumber || `SR-${result.sr}`;

    if (needsApproval) {
      await insertDispatchLoadApproval({
        loadId: result.id,
        action: "create",
        payload: { ...body, monthTab, status: loadStatus },
        requestedBy: auth.user.id,
        requestedByEmail: auth.user.email,
      });
      await notifySuperApprovers({
        action: "create",
        requestedByEmail: auth.user.email,
        companyName: body.companyName,
        loadNumber: loadNo,
      });
      return NextResponse.json({
        ok: true,
        id: result.id,
        sr: result.sr,
        pendingApproval: true,
        message: "Load submitted for super dispatcher approval.",
      });
    }

    const carrierNotified = await notifyCarrierIfEmail({
      loadEmail: body.email,
      carrierName: body.companyName,
      loadNumber: loadNo,
      broker: body.broker,
      pickup: body.pickupDateTime,
      kind: "added",
    }).catch(() => false);

    const dispatcherNotified = await notifyDispatchLoadAction({
      actorEmail: auth.user.email,
      action: "added",
      loadNumber: loadNo,
      carrierName: body.companyName,
    }).catch(() => false);

    return NextResponse.json({
      ok: true,
      id: result.id,
      sr: result.sr,
      carrierNotified,
      dispatcherNotified,
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[dispatcher/loads POST]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  try {
    const body = patchSchema.parse(await req.json());
    const admin = getServiceRoleClient();

    let previousDriverId: string | null = null;
    type LoadMeta = {
      load_number: string | null;
      sr: number;
      company_name: string;
      pickup_date_time: string | null;
      delivery_date_time: string | null;
      email: string | null;
      broker: string | null;
    };
    let loadMeta: LoadMeta | null = null;

    if (admin) {
      const { data: row } = await admin
        .from("dispatch_loads")
        .select(
          "assigned_driver_profile_id, load_number, sr, company_name, pickup_date_time, delivery_date_time, email, broker",
        )
        .eq("id", body.id)
        .maybeSingle();
      if (row) {
        previousDriverId = row.assigned_driver_profile_id as string | null;
        loadMeta = {
          load_number: row.load_number as string | null,
          sr: row.sr as number,
          company_name: row.company_name as string,
          pickup_date_time: row.pickup_date_time as string | null,
          delivery_date_time: row.delivery_date_time as string | null,
          email: row.email as string | null,
          broker: row.broker as string | null,
        };
      }
    }

    const loadNo =
      body.loadNumber ||
      loadMeta?.load_number ||
      (loadMeta ? `SR-${loadMeta.sr}` : "—");
    const company = body.companyName || loadMeta?.company_name || "—";

    if (requiresSuperApproval(auth.role)) {
      await insertDispatchLoadApproval({
        loadId: body.id,
        action: "update",
        payload: body as Record<string, unknown>,
        requestedBy: auth.user.id,
        requestedByEmail: auth.user.email,
      });
      await notifySuperApprovers({
        action: "update",
        requestedByEmail: auth.user.email,
        companyName: company,
        loadNumber: loadNo,
      });
      return NextResponse.json({
        ok: true,
        pendingApproval: true,
        message: "Change submitted for super dispatcher approval.",
      });
    }

    const ok = await updateDispatchLoad(body.id, body);
    if (!ok) return NextResponse.json({ error: "Update failed" }, { status: 500 });

    const loadEmail = body.email ?? loadMeta?.email ?? undefined;

    const isDriverAssignOnly =
      body.assignedDriverProfileId !== undefined &&
      Object.keys(body).filter((k) => k !== "id" && k !== "assignedDriverProfileId").length === 0;

    let carrierNotified = false;
    let dispatcherNotified = false;

    if (!isDriverAssignOnly) {
      carrierNotified = await notifyCarrierIfEmail({
        loadEmail,
        carrierName: company,
        loadNumber: loadNo,
        broker: body.broker ?? loadMeta?.broker ?? "",
        pickup: body.pickupDateTime ?? loadMeta?.pickup_date_time ?? "",
        kind: "updated",
      }).catch(() => false);

      dispatcherNotified = await notifyDispatchLoadAction({
        actorEmail: auth.user.email,
        action: "updated",
        loadNumber: loadNo,
        carrierName: company,
      }).catch(() => false);
    }

    if (
      loadMeta &&
      body.assignedDriverProfileId &&
      body.assignedDriverProfileId !== previousDriverId
    ) {
      const driverEmail = await resolveProfileEmail(body.assignedDriverProfileId);
      const driverName = await resolveProfileName(body.assignedDriverProfileId);

      if (driverEmail) {
        await sendLoadAssignedToDriverEmail({
          to: driverEmail,
          driverName,
          loadNumber: loadNo,
          pickup: loadMeta.pickup_date_time ?? "",
          delivery: loadMeta.delivery_date_time ?? "",
        }).catch(() => {});
      }

      const carrierEmail = resolveLoadCarrierEmail(loadEmail);
      if (carrierEmail) {
        await sendLoadDriverAssignedCarrierEmail({
          to: carrierEmail,
          carrierName: loadMeta.company_name,
          loadNumber: loadNo,
          driverName,
        }).catch(() => {});
        carrierNotified = true;
      }

      await ensureLoadChatThread(body.id, auth.user.id).catch(() => {});
    }

    return NextResponse.json({ ok: true, carrierNotified, dispatcherNotified });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDispatcher(req);
  if ("error" in auth) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json({ error: "Service role unavailable" }, { status: 500 });
  }

  const { data: row } = await admin
    .from("dispatch_loads")
    .select("company_name, load_number, sr, email")
    .eq("id", id)
    .maybeSingle();

  if (row) {
    const loadNo = (row.load_number as string) || `SR-${row.sr}`;
    const company = row.company_name as string;

    if (requiresSuperApproval(auth.role)) {
      await insertDispatchLoadApproval({
        loadId: id,
        action: "delete",
        payload: { id, companyName: company, loadNumber: loadNo },
        requestedBy: auth.user.id,
        requestedByEmail: auth.user.email,
      });
      await notifySuperApprovers({
        action: "delete",
        requestedByEmail: auth.user.email,
        companyName: company,
        loadNumber: loadNo,
      });
      return NextResponse.json({
        ok: true,
        pendingApproval: true,
        message: "Delete request submitted for super dispatcher approval.",
      });
    }

    const ok = await softDeleteDispatchLoad(id);
    if (!ok) return NextResponse.json({ error: "Delete failed" }, { status: 500 });

    const carrierNotified = await notifyCarrierIfEmail({
      loadEmail: row.email as string,
      carrierName: company,
      loadNumber: loadNo,
      kind: "removed",
    }).catch(() => false);

    const dispatcherNotified = await notifyDispatchLoadAction({
      actorEmail: auth.user.email,
      action: "removed",
      loadNumber: loadNo,
      carrierName: company,
    }).catch(() => false);

    return NextResponse.json({ ok: true, carrierNotified, dispatcherNotified });
  }

  return NextResponse.json({ ok: true });
}
