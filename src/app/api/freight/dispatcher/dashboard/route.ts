import { NextResponse } from "next/server";
import { buildDispatchDashboard } from "@/lib/freight/build-dispatch-dashboard";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { canViewContactDetails, maskCarrierRosterEntry, maskDriverRow } from "@/lib/tms/contact-privacy";
import { resolveTmsRole } from "@/lib/tms/auth";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
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

  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const tmsRole = await resolveTmsRole(user);
  const isSuper = isSuperDispatcherEmail(user.email) || tmsRole === "super_dispatcher";
  const viewContacts = canViewContactDetails(tmsRole, user.email);

  try {
    const { searchParams } = new URL(req.url);
    const tab = searchParams.get("tab");
    const dashboard = await buildDispatchDashboard(tab);

    if (!isSuper) {
      dashboard.driver_roster = dashboard.driver_roster.filter(
        (d) => (d as { assignedDispatcherId?: string }).assignedDispatcherId === user.id,
      );
    }

    dashboard.driver_roster = dashboard.driver_roster.map((d) =>
      maskDriverRow(d, viewContacts),
    );
    dashboard.carrier_roster = dashboard.carrier_roster.map((c) =>
      maskCarrierRosterEntry(c, viewContacts),
    );

    return NextResponse.json({ ...dashboard, canViewContacts: viewContacts });
  } catch (e) {
    console.error("[dispatcher/dashboard]", e);
    return NextResponse.json(
      { error: "Failed to load dispatch dashboard" },
      { status: 500 },
    );
  }
}
