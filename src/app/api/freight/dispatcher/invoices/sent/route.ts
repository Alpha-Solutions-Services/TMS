import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
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
    const updated = await updateSentInvoice(body);
    if (!updated) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
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
