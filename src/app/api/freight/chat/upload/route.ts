import { NextRequest, NextResponse } from "next/server";
import { uploadChatAttachment } from "@/lib/freight/chat-attachments";
import { getPortalUser } from "@/lib/portal/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const user = await getPortalUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "file required" }, { status: 400 });
  }

  const attachment = await uploadChatAttachment(file, user.id);
  if (!attachment) {
    return NextResponse.json(
      { error: "Upload failed — PDF or image, max 10MB" },
      { status: 400 },
    );
  }

  return NextResponse.json({ attachment });
}
