import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isAdminUser } from "@/lib/admin-auth";
import { escapeHtml, notifyOps, notifyUser } from "@/lib/email/notify";
import { getSessionUser } from "@/lib/portal/require-session";
import { getPortalUrl } from "@/lib/supabase/env";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

const schema = z.object({
  subject: z.string().min(2).max(200),
  body: z.string().min(10).max(12000),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;
  if (!isAdminUser(session.user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let parsed: z.infer<typeof schema>;
  try {
    parsed = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data: inquiry } = await db
    .from("contact_inquiries")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();

  if (!inquiry) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const portal = getPortalUrl();
  const paragraphs = parsed.body
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map(
      (p) =>
        `<p style="margin:0 0 14px;white-space:pre-wrap;">${escapeHtml(p)}</p>`
    )
    .join("");

  await notifyUser({
    email: inquiry.email as string,
    subject: parsed.subject,
    title: "Message from Alpha Solutions",
    html: `${paragraphs}
      <p style="margin-top:20px;color:#6a8caf;font-size:13px;">
        You’re receiving this because you contacted Alpha Solutions.
        Reply to this email or visit
        <a href="${portal}" style="color:#38a3ff;">the portal</a>.
      </p>`,
  });

  const noteStamp = `[Email sent ${new Date().toISOString()}]\nSubject: ${parsed.subject}\n\n${parsed.body}`;
  const prevNotes = (inquiry.admin_notes as string) || "";
  await db
    .from("contact_inquiries")
    .update({
      status: "contacted",
      read_at: new Date().toISOString(),
      admin_notes: prevNotes
        ? `${prevNotes}\n\n---\n${noteStamp}`
        : noteStamp,
    })
    .eq("id", params.id);

  void notifyOps({
    subject: `Inquiry reply sent to ${inquiry.email}`,
    title: "Inquiry email sent",
    html: `<p>Admin emailed <strong>${escapeHtml(String(inquiry.name))}</strong> (${escapeHtml(String(inquiry.email))}).</p>
      <p><strong>${escapeHtml(parsed.subject)}</strong></p>
      <blockquote style="margin:16px 0;padding:12px 16px;border-left:3px solid #38a3ff;background:#0f1829;">${escapeHtml(parsed.body.slice(0, 500))}</blockquote>
      <p><a href="${portal}/admin?tab=inquiries" style="color:#38a3ff;">Open inquiries</a></p>`,
  });

  return NextResponse.json({ ok: true });
}
