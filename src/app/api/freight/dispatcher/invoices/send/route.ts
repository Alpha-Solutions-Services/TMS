import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { buildDispatchDashboard } from "@/lib/freight/build-dispatch-dashboard";
import { sendCarrierDispatchInvoiceEmail } from "@/lib/freight/emails";
import {
  getDefaultIssuer,
  getInvoiceFriday,
  invoicePdfFilename,
} from "@/lib/freight/dispatch-invoice";
import { buildDispatchInvoicesForBatch } from "@/lib/freight/dispatch-invoice-service";
import {
  isLoadBilledOnSentInvoice,
  listBilledLoadKeys,
  recordSentInvoice,
} from "@/lib/freight/dispatch-sent-invoices-db";
import { isInvoiceableLoad } from "@/lib/freight/dispatch-invoice";
import { buildInvoicePdfWithPayment } from "@/lib/freight/dispatch-invoice-build";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  tab: z.string().optional(),
  carriers: z.array(z.string()).optional(),
  loadSrs: z.array(z.string()).optional(),
  invoiceDate: z.string().optional(),
  paymentMethod: z.enum(["s_zelle", "m_zelle"]).optional(),
  invoiceNumbers: z.record(z.string(), z.string()).optional(),
});

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

  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (!me || me.role !== "dispatcher") {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  try {
    const body = bodySchema.parse(await req.json());
    const dashboard = await buildDispatchDashboard(body.tab);

    const billed = await listBilledLoadKeys();
    let loads = dashboard.loads.filter(
      (l) => isInvoiceableLoad(l) && !isLoadBilledOnSentInvoice(l, billed),
    );
    if (body.loadSrs?.length) {
      const srSet = new Set(body.loadSrs);
      loads = loads.filter((l) => srSet.has(l.sr));
    }

    const invoiceDate = body.invoiceDate
      ? new Date(body.invoiceDate)
      : getInvoiceFriday();

    const invoices = await buildDispatchInvoicesForBatch({
      loads,
      carriers: body.carriers,
      invoiceDate,
      invoiceNumbersByCarrier: body.invoiceNumbers,
      carrierRoster: dashboard.carrier_roster,
    });

    if (invoices.length === 0) {
      return NextResponse.json(
        {
          error:
            "No invoiceable loads found. Add company name, load #, and dispatch fee (or RC invoice + %) on the sheet.",
        },
        { status: 400 },
      );
    }

    const issuer = getDefaultIssuer();
    const results: { carrier: string; ok: boolean; error?: string }[] = [];

    for (const invoice of invoices) {
      const email = invoice.billTo.email?.trim();
      if (!email || email === "—") {
        results.push({
          carrier: invoice.carrierName,
          ok: false,
          error: "Missing email on dispatch sheet",
        });
        continue;
      }

      const { pdf, payment } = await buildInvoicePdfWithPayment(
        invoice,
        issuer,
        body.paymentMethod,
      );
      const filename = invoicePdfFilename(invoice);
      const sent = await sendCarrierDispatchInvoiceEmail({
        invoice,
        issuer,
        payment,
        pdf,
        pdfFilename: filename,
      });

      if (sent.ok) {
        const monthTab =
          (body.tab?.trim() || dashboard.sheet_meta.active_tab || "").trim();
        const saved = await recordSentInvoice({
          invoice,
          loads,
          monthTab,
          paymentMethod: body.paymentMethod,
          sentBy: user.id,
        });

        if (!saved.record) {
          results.push({
            carrier: invoice.carrierName,
            ok: false,
            error:
              saved.error ??
              "Email sent but invoice was not saved to Sent tab — check DB schema",
          });
          continue;
        }

        results.push({
          carrier: invoice.carrierName,
          ok: true,
        });
        continue;
      }

      results.push({
        carrier: invoice.carrierName,
        ok: false,
        error: sent.error ?? "Email failed",
      });
    }

    const sentCount = results.filter((r) => r.ok).length;
    const failed = results.filter((r) => !r.ok);

    if (sentCount === 0) {
      return NextResponse.json(
        {
          error:
            failed[0]?.error ??
            "Could not send invoices — check carrier email on the dispatch sheet and SMTP settings",
          results,
        },
        { status: 400 },
      );
    }

    return NextResponse.json({
      ok: true,
      sent: sentCount,
      failed: failed.length,
      results,
    });
  } catch (e) {
    console.error("[invoices/send]", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const message = e instanceof Error ? e.message : "Failed to send invoices";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
