import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { checkRateLimit, sanitizeText } from "@/lib/freight/api-security";
import {
  createCommunityPost,
  listCommunityPosts,
} from "@/lib/freight/community";
import { requireCarrierSession } from "@/lib/freight/require-carrier";

export async function GET(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-community-get", 40)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;
  return NextResponse.json({ posts: await listCommunityPosts() });
}

const postSchema = z.object({
  title: z.string().min(2).max(160),
  body: z.string().min(2).max(4000),
});

export async function POST(req: NextRequest) {
  if (!checkRateLimit(req, "carrier-community-post", 12)) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const auth = await requireCarrierSession({ verified: true });
  if ("error" in auth) return auth.error;

  try {
    const body = postSchema.parse(await req.json());
    const created = await createCommunityPost({
      authorProfileId: auth.user.id,
      title: sanitizeText(body.title, 160),
      body: sanitizeText(body.body, 4000),
    });
    if ("error" in created) {
      return NextResponse.json({ error: created.error }, { status: 500 });
    }
    return NextResponse.json({ ok: true, post: created.row });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
