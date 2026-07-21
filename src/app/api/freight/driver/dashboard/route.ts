import { NextResponse } from "next/server";
import { dbLoadToDashboardLoad, fetchDriverLoadsFromDb } from "@/lib/freight/dispatch-loads-db";
import { getLoadDocumentSignedUrl } from "@/lib/freight/load-documents";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await sb
    .from("profiles")
    .select("role, full_name, company_name, carrier_id")
    .eq("id", user.id)
    .maybeSingle();

  if (!profile || profile.role !== "driver") {
    return NextResponse.json({ error: "Driver only" }, { status: 403 });
  }

  const rows = await fetchDriverLoadsFromDb(user.id);
  const loads = await Promise.all(
    rows.map(async (row, i) => {
      const l = dbLoadToDashboardLoad(row, i);
      const [rateConUrl, bolUrl, commodityUrl, podUrl] = await Promise.all([
        getLoadDocumentSignedUrl(row.rate_con_path),
        getLoadDocumentSignedUrl(row.bol_path),
        getLoadDocumentSignedUrl(row.commodity_path),
        getLoadDocumentSignedUrl(row.pod_path),
      ]);
      return {
        id: row.id,
        load_number: l.load_number !== "—" ? l.load_number : l.sr,
        pickup: l.pickup,
        delivery: l.delivery,
        rate: l.rate,
        status: l.status,
        miles: l.miles,
        broker: l.broker,
        carrier: l.carrier,
        documents: {
          rate_con: Boolean(row.rate_con_path),
          bol: Boolean(row.bol_path),
          commodity: Boolean(row.commodity_path),
          pod: Boolean(row.pod_path),
        },
        document_urls: {
          rate_con: rateConUrl,
          bol: bolUrl,
          commodity: commodityUrl,
          pod: podUrl,
        },
      };
    }),
  );

  return NextResponse.json({
    driver: {
      name: profile.full_name || "Driver",
      company: profile.company_name || "—",
    },
    loads,
    generated_at: new Date().toISOString(),
  });
}
