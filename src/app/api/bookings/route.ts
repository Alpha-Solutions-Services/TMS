import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createNotification, findUserIdByEmail } from "@/lib/notifications";
import { getPortalUrl } from "@/lib/supabase/env";
import { notifyUser, escapeHtml, notifyOps } from "@/lib/email/notify";

const calComUrl = () =>
  process.env.NEXT_PUBLIC_CAL_COM_URL?.trim() ||
  process.env.CAL_COM_URL?.trim() ||
  null;

export async function GET() {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ slots: [], bookings: [], calComUrl: calComUrl() });

  const staff = await isPortalStaff(session.user);

  const { data: slots } = await db
    .from("portal_booking_slots")
    .select("*")
    .eq("active", true)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: true })
    .limit(50);

  let bookingsQuery = db
    .from("portal_bookings")
    .select("*")
    .order("starts_at", { ascending: true })
    .limit(100);
  if (!staff) {
    bookingsQuery = bookingsQuery.eq("client_user_id", session.user.id);
  }
  const { data: bookings } = await bookingsQuery;

  return NextResponse.json({
    slots: (slots ?? []).filter((s) => s.booked_count < s.capacity),
    bookings: bookings ?? [],
    calComUrl: calComUrl(),
  });
}

const slotSchema = z.object({
  action: z.literal("create_slot"),
  startsAt: z.string(),
  endsAt: z.string(),
  kind: z.enum(["demo", "kickoff", "review", "other"]).optional(),
  notes: z.string().max(500).optional(),
});

const bookSchema = z.object({
  action: z.literal("book"),
  slotId: z.string().uuid().optional(),
  startsAt: z.string().optional(),
  endsAt: z.string().optional(),
  kind: z.enum(["demo", "kickoff", "review", "other"]).optional(),
  clientName: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  meetingUrl: z.string().url().optional().nullable(),
});

const adminBookSchema = z.object({
  action: z.literal("admin_book"),
  clientEmail: z.string().email(),
  clientName: z.string().max(200).optional(),
  startsAt: z.string(),
  endsAt: z.string(),
  kind: z.enum(["demo", "kickoff", "review", "other"]).optional(),
  meetingUrl: z.string().url().optional().nullable(),
  notes: z.string().max(1000).optional(),
});

export async function POST(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const body = await req.json();
  const staff = await isPortalStaff(session.user);

  if (body.action === "create_slot") {
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = slotSchema.parse(body);
    const { data, error } = await db
      .from("portal_booking_slots")
      .insert({
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        kind: parsed.kind || "demo",
        notes: parsed.notes || null,
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
    return NextResponse.json({ ok: true, slot: data });
  }

  if (body.action === "admin_book") {
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const parsed = adminBookSchema.parse(body);
    const uid = await findUserIdByEmail(parsed.clientEmail);
    const { data, error } = await db
      .from("portal_bookings")
      .insert({
        starts_at: parsed.startsAt,
        ends_at: parsed.endsAt,
        kind: parsed.kind || "demo",
        client_email: parsed.clientEmail,
        client_name: parsed.clientName || null,
        client_user_id: uid,
        meeting_url: parsed.meetingUrl || null,
        cal_com_url: calComUrl(),
        notes: parsed.notes || null,
        status: "confirmed",
      })
      .select("*")
      .single();
    if (error) return NextResponse.json({ error: "Failed" }, { status: 500 });
    void notifyUser({
      email: parsed.clientEmail,
      subject: `Meeting booked: ${parsed.kind || "demo"}`,
      title: "Meeting confirmed",
      html: `<p>Your ${escapeHtml(parsed.kind || "demo")} is scheduled for <strong>${escapeHtml(new Date(parsed.startsAt).toLocaleString())}</strong>.</p>
        ${parsed.meetingUrl ? `<p><a href="${escapeHtml(parsed.meetingUrl)}" style="color:#38a3ff;">Join link</a></p>` : ""}
        <p><a href="${getPortalUrl()}/dashboard?tab=schedule" style="color:#38a3ff;">View in portal</a></p>`,
    });
    if (uid) {
      await createNotification({
        userId: uid,
        title: "Meeting booked",
        body: new Date(parsed.startsAt).toLocaleString(),
        href: `${getPortalUrl()}/dashboard?tab=schedule`,
      });
    }
    return NextResponse.json({ ok: true, booking: data });
  }

  // Client self-book
  const parsed = bookSchema.parse(body);
  let startsAt = parsed.startsAt;
  let endsAt = parsed.endsAt;
  let kind: string = parsed.kind || "demo";
  let slotId = parsed.slotId || null;

  if (parsed.slotId) {
    const { data: slot } = await db
      .from("portal_booking_slots")
      .select("*")
      .eq("id", parsed.slotId)
      .maybeSingle();
    if (!slot || !slot.active || slot.booked_count >= slot.capacity) {
      return NextResponse.json({ error: "Slot unavailable" }, { status: 409 });
    }
    startsAt = slot.starts_at as string;
    endsAt = slot.ends_at as string;
    kind = String(slot.kind || "demo");
    await db
      .from("portal_booking_slots")
      .update({ booked_count: (slot.booked_count as number) + 1 })
      .eq("id", slot.id);
  }

  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: "Missing time" }, { status: 400 });
  }

  const { data, error } = await db
    .from("portal_bookings")
    .insert({
      slot_id: slotId,
      starts_at: startsAt,
      ends_at: endsAt,
      kind,
      client_user_id: session.user.id,
      client_email: session.user.email || "",
      client_name: parsed.clientName || session.user.user_metadata?.full_name || null,
      notes: parsed.notes || null,
      meeting_url: parsed.meetingUrl || null,
      cal_com_url: calComUrl(),
      status: "confirmed",
    })
    .select("*")
    .single();

  if (error) {
    console.error("[bookings]", error);
    return NextResponse.json({ error: "Booking failed" }, { status: 500 });
  }

  void notifyOps({
    subject: `New booking: ${kind} — ${session.user.email}`,
    title: "New booking",
    html: `<p>${escapeHtml(session.user.email || "")} booked a <strong>${escapeHtml(kind)}</strong>.</p>
      <p>${escapeHtml(new Date(startsAt).toLocaleString())}</p>
      <p><a href="${getPortalUrl()}/admin?tab=schedule" style="color:#38a3ff;">Open schedule</a></p>`,
  });

  return NextResponse.json({ ok: true, booking: data, calComUrl: calComUrl() });
}
