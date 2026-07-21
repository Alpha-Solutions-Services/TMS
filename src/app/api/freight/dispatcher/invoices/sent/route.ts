import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { logFreightAction } from "@/lib/freight/audit-log";
import { FREIGHT_TEAM_EMAIL } from "@/lib/freight/constants";
import { sendInvoicePaymentReceivedEmail } from "@/lib/freight/emails";
import {
  getNextInvoiceNumber,
  listSentInvoices,
  reconcileSentInvoicesWithLoads,
  softDeleteSentInvoice,
  updateSentInvoice,
} from "@/lib/freight/dispatch-sent-invoices-db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireDispatcher() {
  const sb = await createClient();
  if (!sb) return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!me || me.role !== "dispatcher") {
    return { error: NextResponse.json({ error: "Dispatcher only" }, { status: 403 }) };
  }

  return { user };
}

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth && auth.error) return auth.error;

  // Default: all months (so Sent tab always shows what was emailed).
  // Pass ?tab=Month Year to filter; ?tab=all is explicit no-filter.
  const tabParam = req.nextUrl.searchParams.get("tab");
  const tab =
    !tabParam || tabParam === "all" || tabParam === "*"
      ? undefined
      : tabParam;

  // Re-sync Paid/Sent onto load board (fixes Invoice stuck on Pending).
  await reconcileSentInvoicesWithLoads();

  const [invoices, nextInvoiceNumber] = await Promise.all([
    listSentInvoices(tab),
    getNextInvoiceNumber(),
  ]);

  return NextResponse.json({ invoices, nextInvoiceNumber });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  paymentStatus: z.enum(["unpaid", "partial", "paid"]).optional(),
  amountReceived: z.number().min(0).optional(),
  invoiceNumber: z.string().min(1).max(40).optional(),
  notes: z.string().max(500).optional(),
  syncLoads: z.boolean().optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth && auth.error) return auth.error;

  try {
    const body = patchSchema.parse(await req.json());

    const before = (await listSentInvoices()).find((inv) => inv.id === body.id);
    const updated = await updateSentInvoice(body);
    if (!updated) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
    }

    const statusChanged =
      before &&
      (before.paymentStatus !== updated.paymentStatus ||
        before.amountReceived !== updated.amountReceived);

    if (
      statusChanged &&
      (updated.paymentStatus === "paid" || updated.paymentStatus === "partial")
    ) {
      const recipients = new Set<string>();
      const carrierEmail = updated.carrierEmail?.trim();
      if (carrierEmail) recipients.add(carrierEmail);
      const team = FREIGHT_TEAM_EMAIL?.trim();
      if (team) recipients.add(team);

      await Promise.all(
        Array.from(recipients).map((to) =>
          sendInvoicePaymentReceivedEmail({
            to,
            carrierName: updated.carrierName,
            invoiceNumber: updated.invoiceNumber,
            amountReceived: updated.amountReceived,
            amountTotal: updated.amountTotal,
            paymentStatus: updated.paymentStatus === "paid" ? "paid" : "partial",
          }).catch(() => {}),
        ),
      );

      await logFreightAction({
        actorId: auth.user?.id,
        actorEmail: auth.user?.email,
        action: updated.paymentStatus === "paid" ? "invoice.paid" : "invoice.partial",
        entityType: "dispatch_sent_invoice",
        entityId: updated.id,
        meta: {
          invoiceNumber: updated.invoiceNumber,
          carrierName: updated.carrierName,
          amountReceived: updated.amountReceived,
          amountTotal: updated.amountTotal,
        },
      });
    }

    return NextResponse.json({ ok: true, invoice: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[invoices/sent PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth && auth.error) return auth.error;

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const ok = await softDeleteSentInvoice(id);
  if (!ok) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
