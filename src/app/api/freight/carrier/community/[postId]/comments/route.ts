import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import { createComment, listComments } from "@/lib/freight/community";
import { requireCarrierSession } from "@/lib/freight/require-carrier";

type Ctx = { params: { postId: string } };

export async function GET(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "carrier-community-comments-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;
  const postId = ctx.params.postId;
  if (!postId) {
    return NextResponse.json({ error: "postId required" }, { status: 400 });
  }
  return NextResponse.json({ comments: await listComments(postId) });
}

const postSchema = z.object({
  body: z.string().min(1).max(2000),
});

export async function POST(req: NextRequest, ctx: Ctx) {
  if (!checkRateLimit(req, "carrier-community-comments-post", 20)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const created = await createComment({
      postId: ctx.params.postId,
      authorProfileId: auth.user.id,
      body: sanitizeText(body.body, 2000),
    });
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, comment: created.row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
