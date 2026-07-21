import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { emailTicketCreated } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ tickets: [] });

  const { data, error } = await db
    .from("support_tickets")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error("[admin/tickets]", error);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }
  return NextResponse.json({ tickets: data ?? [] });
}
