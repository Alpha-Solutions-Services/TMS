import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createNotification, findUserIdByEmail } from "@/lib/notifications";
import { getPortalUrl } from "@/lib/supabase/env";
import { escapeHtml, notifyUser } from "@/lib/email/notify";

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ quotes: [] });

  const staff = await isPortalStaff(session.user);
  if (staff) {
    const { data } = await db
      .from("portal_quotes")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    return NextResponse.json({ quotes: data ?? [] });
  }

  const email = session.user.email?.toLowerCase();
  if (!email) return NextResponse.json({ quotes: [] });
  const { data } = await db
    .from("portal_quotes")
    .select("*")
    .ilike("client_email", email)
    .in("status", ["sent", "accepted", "declined"])
    .order("created_at", { ascending: false });
  return NextResponse.json({ quotes: data ?? [] });
}

const createSchema = z.object({
  dealId: z.string().uuid().optional().nullable(),
  clientEmail: z.string().email(),
  clientName: z.string().max(200).optional(),
  title: z.string().min(2).max(200),
  lineItems: z
    .array(
      z.object({
        description: z.string(),
        amount: z.number(),
      })
    )
    .min(1),
  tax: z.number().nonnegative().optional(),
  currency: z.string().max(8).optional(),
  validUntil: z.string().optional().nullable(),
  notes: z.string().max(5000).optional(),
  send: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!(await isPortalStaff(session.user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof createSchema>;
  try {
    parsed = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const subtotal = parsed.lineItems.reduce((s, i) => s + i.amount, 0);
  const tax = parsed.tax ?? 0;
  const total = subtotal + tax;
  const sendNow = parsed.send !== false;

  const { data, error } = await db
    .from("portal_quotes")
    .insert({
      deal_id: parsed.dealId || null,
      client_email: parsed.clientEmail,
      client_name: parsed.clientName || null,
      title: parsed.title,
      line_items: parsed.lineItems,
      subtotal,
      tax,
      total,
      currency: parsed.currency || "USD",
      status: sendNow ? "sent" : "draft",
      valid_until: parsed.validUntil || null,
      notes: parsed.notes || null,
      sent_at: sendNow ? new Date().toISOString() : null,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[quotes POST]", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  if (parsed.dealId) {
    await db
      .from("portal_deals")
      .update({ stage: "quoted", updated_at: new Date().toISOString() })
      .eq("id", parsed.dealId);
  }

  if (sendNow) {
    const portal = getPortalUrl();
    const itemsHtml = parsed.lineItems
      .map(
        (i) =>
          `<tr><td style="padding:8px;border-bottom:1px solid #1a2740;">${escapeHtml(i.description)}</td><td style="padding:8px;border-bottom:1px solid #1a2740;text-align:right;">${i.amount.toFixed(2)}</td></tr>`
      )
      .join("");
    void notifyUser({
      email: parsed.clientEmail,
      subject: `Quote: ${parsed.title}`,
      title: "Your quote",
      html: `<p>Please review the quote below.</p>
        <table style="width:100%;border-collapse:collapse;margin:16px 0;">${itemsHtml}</table>
        <p><strong>Total: ${total.toFixed(2)} ${parsed.currency || "USD"}</strong></p>
        <p><a href="${portal}/dashboard?tab=quotes" style="display:inline-block;padding:10px 18px;background:#38a3ff;color:#05080f;border-radius:8px;text-decoration:none;font-weight:600;">View & respond</a></p>`,
    });
    const uid = await findUserIdByEmail(parsed.clientEmail);
    if (uid) {
      await createNotification({
        userId: uid,
        title: "New quote received",
        body: parsed.title,
        href: `${portal}/dashboard?tab=quotes`,
      });
    }
  }

  return NextResponse.json({ ok: true, quote: data });
}

const respondSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["accept", "decline"]),
});

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof respondSchema>;
  try {
    parsed = respondSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const staff = await isPortalStaff(session.user);
  const { data: quote } = await db
    .from("portal_quotes")
    .select("*")
    .eq("id", parsed.id)
    .maybeSingle();
  if (!quote) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (
    !staff &&
    quote.client_email?.toLowerCase() !== session.user.email?.toLowerCase()
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const status = parsed.action === "accept" ? "accepted" : "declined";
  await db
    .from("portal_quotes")
    .update({
      status,
      responded_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.id);

  if (quote.deal_id) {
    await db
      .from("portal_deals")
      .update({
        stage: parsed.action === "accept" ? "negotiation" : "lost",
        updated_at: new Date().toISOString(),
        loss_reason:
          parsed.action === "decline" ? "Quote declined" : undefined,
      })
      .eq("id", quote.deal_id);
  }

  return NextResponse.json({ ok: true });
}
