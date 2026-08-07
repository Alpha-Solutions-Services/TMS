import { NextResponse } from "next/server";
import { listActiveAnnouncements } from "@/lib/freight/announcements";
import { isCarrierIdentity } from "@/lib/freight/carrier-identity";
import { fetchCarrierDocuments } from "@/lib/freight/carrier-documents";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET — lightweight alerts for carrier top-bar bell. */
export async function GET() {
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

  const { data: profile } = await sb
    .from("profiles")
    .select("role, carrier_status")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile || !isCarrierIdentity(profile)) {
    return NextResponse.json({ error: "Carrier only" }, { status: 403 });
  }

  const announcements = await listActiveAnnouncements("carrier");
  let rejectedDocs = 0;
  let pendingDocs = 0;
  try {
    const docs = await fetchCarrierDocuments(user.id);
    for (const d of docs ?? []) {
      if (d.status === "rejected") rejectedDocs += 1;
      if (d.status === "pending") pendingDocs += 1;
    }
  } catch {
    // optional
  }

  const items: {
    id: string;
    title: string;
    body: string;
    href: string;
    kind: "announcement" | "document";
  }[] = announcements.map((a) => ({
    id: `a-${a.id}`,
    title: a.title,
    body: a.body,
    href: "/carrier/dashboard",
    kind: "announcement" as const,
  }));

  if (rejectedDocs > 0) {
    items.unshift({
      id: "docs-rejected",
      title: `${rejectedDocs} document${rejectedDocs === 1 ? "" : "s"} need attention`,
      body: "Review rejected uploads and resubmit.",
      href: "/carrier/documents",
      kind: "document",
    });
  } else if (pendingDocs > 0) {
    items.push({
      id: "docs-pending",
      title: `${pendingDocs} document${pendingDocs === 1 ? "" : "s"} pending review`,
      body: "Dispatch is reviewing your uploads.",
      href: "/carrier/documents",
      kind: "document",
    });
  }

  return NextResponse.json({
    count: items.length,
    items: items.slice(0, 8),
  });
}
