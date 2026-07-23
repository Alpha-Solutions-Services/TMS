import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  deliverAuthNotifications,
  smtpConfigured,
  authNotifyRecipients,
} from "@/lib/email/auth-notify";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole } from "@/lib/tms/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const schema = z.object({
  kind: z.string().min(1).max(40).default("login"),
  email: z.string().email().optional(),
  role: z.string().max(40).optional(),
  displayName: z.string().max(120).optional(),
  detail: z.string().max(500).optional(),
});

/** Health: is SMTP configured? (no secrets returned) */
export async function GET() {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({
    smtpConfigured: smtpConfigured(),
    recipients: authNotifyRecipients(),
    smtpHost: process.env.SMTP_HOST?.trim() || null,
    smtpUser: process.env.SMTP_USER?.trim() || null,
  });
}

/**
 * Client-triggered login/signup notify → support + signed-in user.
 */
export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!smtpConfigured()) {
    console.error("[activity-notify] SMTP missing on Vercel");
    return NextResponse.json(
      {
        ok: false,
        error:
          "SMTP not configured. Set SMTP_HOST, SMTP_USER, SMTP_PASS on the TMS Vercel project.",
      },
      { status: 503 },
    );
  }

  let body: z.infer<typeof schema>;
  try {
    body = schema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const role =
    body.role ||
    (await resolveTmsRole(user).catch(() => null)) ||
    "unknown";

  const result = await deliverAuthNotifications({
    kind: body.kind,
    email: body.email || user.email || "unknown",
    userId: user.id,
    profileRole: role,
    displayName: body.displayName,
    detail: body.detail,
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error ?? "Email failed", sent: result.sent },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, sent: result.sent });
}
