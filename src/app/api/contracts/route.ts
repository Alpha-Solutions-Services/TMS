import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { isPortalStaff } from "@/lib/admin-auth";
import { getSessionUser } from "@/lib/portal/require-session";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { createNotification, findUserIdByEmail } from "@/lib/notifications";
import { getPortalUrl } from "@/lib/supabase/env";
import { escapeHtml, notifyUser, notifyOps } from "@/lib/email/notify";
import { randomBytes } from "crypto";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ contracts: [] });

  if (token) {
    const { data } = await db
      .from("portal_contracts")
      .select("*")
      .eq("sign_token", token)
      .maybeSingle();
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (data.status === "sent") {
      await db
        .from("portal_contracts")
        .update({ status: "viewed", updated_at: new Date().toISOString() })
        .eq("id", data.id);
    }
    return NextResponse.json({ contract: data });
  }

  const session = await getSessionUser();
  if ("error" in session) return session.error;
  const staff = await isPortalStaff(session.user);

  if (staff) {
    const { data } = await db
      .from("portal_contracts")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
    return NextResponse.json({ contracts: data ?? [] });
  }

  const { data } = await db
    .from("portal_contracts")
    .select("*")
    .or(
      `client_user_id.eq.${session.user.id},client_email.ilike.${session.user.email}`
    )
    .order("created_at", { ascending: false });
  return NextResponse.json({ contracts: data ?? [] });
}

const createSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(20).max(50000),
  clientEmail: z.string().email(),
  clientName: z.string().max(200).optional(),
  dealId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  depositAmount: z.number().nonnegative().optional().nullable(),
  depositStatus: z
    .enum(["not_required", "pending", "paid", "waived", "refunded"])
    .optional(),
  invoiceUrl: z.string().url().optional().nullable().or(z.literal("")),
  invoiceRef: z.string().max(100).optional().nullable(),
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

  const token = randomBytes(24).toString("hex");
  const sendNow = parsed.send !== false;
  const uid = await findUserIdByEmail(parsed.clientEmail);

  const { data, error } = await db
    .from("portal_contracts")
    .insert({
      title: parsed.title,
      body: parsed.body,
      client_email: parsed.clientEmail,
      client_name: parsed.clientName || null,
      client_user_id: uid,
      deal_id: parsed.dealId || null,
      project_id: parsed.projectId || null,
      deposit_amount: parsed.depositAmount ?? null,
      deposit_status:
        parsed.depositStatus ||
        (parsed.depositAmount ? "pending" : "not_required"),
      invoice_url: parsed.invoiceUrl || null,
      invoice_ref: parsed.invoiceRef || null,
      status: sendNow ? "sent" : "draft",
      sign_token: token,
    })
    .select("*")
    .single();

  if (error || !data) {
    console.error("[contracts]", error);
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }

  if (sendNow) {
    const signUrl = `${getPortalUrl()}/dashboard?tab=contracts&sign=${token}`;
    void notifyUser({
      email: parsed.clientEmail,
      subject: `Contract ready: ${parsed.title}`,
      title: "Please review & sign",
      html: `<p>A contract is ready for your review.</p>
        <p><strong>${escapeHtml(parsed.title)}</strong></p>
        ${
          parsed.depositAmount
            ? `<p>Deposit: <strong>${parsed.depositAmount} USD</strong> (${parsed.depositStatus || "pending"})</p>`
            : ""
        }
        <p><a href="${signUrl}" style="display:inline-block;padding:10px 18px;background:#38a3ff;color:#05080f;border-radius:8px;text-decoration:none;font-weight:600;">Review & sign</a></p>`,
    });
    if (uid) {
      await createNotification({
        userId: uid,
        title: "Contract ready to sign",
        body: parsed.title,
        href: signUrl,
      });
    }
  }

  return NextResponse.json({ ok: true, contract: data });
}

const patchSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["sign", "decline", "set_deposit"]),
  signedName: z.string().min(2).max(200).optional(),
  token: z.string().optional(),
  depositStatus: z
    .enum(["not_required", "pending", "paid", "waived", "refunded"])
    .optional(),
});

export async function PATCH(req: NextRequest) {
  const session = await getSessionUser();
  if ("error" in session) return session.error;

  let parsed: z.infer<typeof patchSchema>;
  try {
    parsed = patchSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const db = getServiceRoleClient();
  if (!db) return NextResponse.json({ error: "Not configured" }, { status: 503 });

  const { data: contract } = await db
    .from("portal_contracts")
    .select("*")
    .eq("id", parsed.id)
    .maybeSingle();
  if (!contract) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const staff = await isPortalStaff(session.user);

  if (parsed.action === "set_deposit") {
    if (!staff) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await db
      .from("portal_contracts")
      .update({
        deposit_status: parsed.depositStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);
    if (contract.client_user_id) {
      await createNotification({
        userId: contract.client_user_id as string,
        title: "Deposit status updated",
        body: `Now: ${parsed.depositStatus}`,
        href: `${getPortalUrl()}/dashboard?tab=contracts`,
        email: contract.client_email as string,
      });
    }
    return NextResponse.json({ ok: true });
  }

  const canSign =
    staff ||
    contract.client_user_id === session.user.id ||
    contract.client_email?.toLowerCase() === session.user.email?.toLowerCase() ||
    (parsed.token && parsed.token === contract.sign_token);

  if (!canSign) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (parsed.action === "sign") {
    if (!parsed.signedName) {
      return NextResponse.json({ error: "Name required" }, { status: 400 });
    }
    await db
      .from("portal_contracts")
      .update({
        status: "signed",
        signed_at: new Date().toISOString(),
        signed_name: parsed.signedName,
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);
    void notifyOps({
      subject: `Contract signed: ${contract.title}`,
      title: "Contract signed",
      html: `<p><strong>${escapeHtml(parsed.signedName)}</strong> signed <em>${escapeHtml(String(contract.title))}</em>.</p>`,
    });
  } else {
    await db
      .from("portal_contracts")
      .update({
        status: "declined",
        updated_at: new Date().toISOString(),
      })
      .eq("id", parsed.id);
  }

  return NextResponse.json({ ok: true });
}
