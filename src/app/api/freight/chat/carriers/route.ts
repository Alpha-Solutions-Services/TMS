import { NextResponse } from "next/server";
import { assertDispatcher } from "@/lib/freight/dispatch-roster";
import { createClient } from "@/lib/supabase/server";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { canViewContactDetails } from "@/lib/tms/contact-privacy";
import { isSuperDispatcherEmail } from "@/lib/tms/roles";
import { canChatWithCarriers } from "@/lib/tms/permissions";
import { resolveDispatcherTmsRole } from "@/lib/freight/dispatch-roster";
import type { TmsRole } from "@/lib/tms/roles";

export const dynamic = "force-dynamic";

export async function GET() {
  const sb = await createClient();
  if (!sb) return NextResponse.json({ error: "Supabase unavailable" }, { status: 500 });

  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!(await assertDispatcher(user))) {
    return NextResponse.json({ error: "Dispatcher only" }, { status: 403 });
  }

  const role = (await resolveDispatcherTmsRole(user)) as TmsRole;
  if (!canChatWithCarriers(role)) {
    return NextResponse.json({ error: "Sub dispatchers cannot access carrier chat" }, { status: 403 });
  }

  const viewContacts = canViewContactDetails(role, user.email);
  const isSuper = isSuperDispatcherEmail(user.email) || role === "super_dispatcher";

  const admin = getServiceRoleClient();
  if (!admin) return NextResponse.json({ carriers: [] });

  let query = admin
    .from("profiles")
    .select("id, email, company_name, full_name")
    .eq("role", "carrier")
    .eq("carrier_status", "verified")
    .order("company_name");

  if (!isSuper) {
    query = query.eq("assigned_dispatcher_id", user.id);
  }

  const { data: profiles } = await query;

  const carriers = (profiles ?? []).map((p) => ({
    profileId: p.id as string,
    companyName: (p.company_name as string) || (p.full_name as string) || "Carrier",
    email: viewContacts ? ((p.email as string) || "") : "",
  }));

  return NextResponse.json({ carriers, canViewContacts: viewContacts });
}
