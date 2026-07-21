import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { z } from "zod";
import { buildDispatchDashboard } from "@/lib/freight/build-dispatch-dashboard";
import {
  getDefaultIssuer,
  getInvoiceFriday,
  invoicePdfFilename,
} from "@/lib/freight/dispatch-invoice";
import { buildDispatchInvoicesForBatch } from "@/lib/freight/dispatch-invoice-service";
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

    let loads = dashboard.loads;
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

    if (invoices.length === 1) {
      const { pdf } = await buildInvoicePdfWithPayment(
        invoices[0],
        issuer,
        body.paymentMethod,
      );
      const filename = invoicePdfFilename(invoices[0]);
      return new NextResponse(new Uint8Array(pdf), {
        status: 200,
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      });
    }

    const zip = new JSZip();
    for (const invoice of invoices) {
      const { pdf } = await buildInvoicePdfWithPayment(
        invoice,
        issuer,
        body.paymentMethod,
      );
      zip.file(invoicePdfFilename(invoice), pdf);
    }

    const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
    const stamp = invoiceDate.toISOString().slice(0, 10);

    return new NextResponse(new Uint8Array(zipBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="dispatch-invoices-${stamp}.zip"`,
      },
    });
  } catch (e) {
    console.error("[invoices/generate]", e);
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    const message =
      e instanceof Error ? e.message : "Failed to generate invoices";
    return NextResponse.json(
      {
        error:
          message.includes("ENOENT") || message.includes("Helvetica")
            ? "PDF engine failed on server — redeploy with latest build"
            : message || "Failed to generate invoices",
      },
      { status: 500 },
    );
  }
}
