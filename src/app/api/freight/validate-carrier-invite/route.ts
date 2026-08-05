import { NextRequest, NextResponse } from "next/server";
import { validateCarrierInviteToken } from "@/lib/freight/carrier-invitations";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token")?.trim();
  if (!token) {
    return NextResponse.json({ error: "token required" }, { status: 400 });
  }

  const result = await validateCarrierInviteToken(token);
  if (!result.valid) {
    return NextResponse.json({
      valid: false,
      reason: result.reason,
    });
  }

  return NextResponse.json({
    valid: true,
    invitedEmail: result.invitedEmail,
    inviteeName: result.inviteeName,
    requiresDocuments: result.requiresDocuments,
    inviterName: result.inviterName,
    expiresAt: result.expiresAt,
  });
}
