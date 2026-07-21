import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  addStudentNote,
  listPublishedModules,
  listStudentNotes,
  listStudentProgress,
  upsertStudentProgress,
} from "@/lib/freight/academy-db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireStaff() {
  const sb = await createClient();
  if (!sb) {
    return { error: NextResponse.json({ error: "Supabase unavailable" }, { status: 500 }) };
  }
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user?.id) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
  const { data: me } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (!me || (me.role !== "instructor" && me.role !== "dispatcher")) {
    return { error: NextResponse.json({ error: "Staff only" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ studentId: string }> | { studentId: string } },
) {
  const auth = await requireStaff();
  if ("error" in auth && auth.error) return auth.error;

  const params = await Promise.resolve(ctx.params);
  const studentId = params.studentId;

  const [notes, modules, progress] = await Promise.all([
    listStudentNotes(studentId),
    listPublishedModules(),
    listStudentProgress(studentId),
  ]);

  return NextResponse.json({ notes, modules, progress });
}

const postSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("note"),
    body: z.string().min(1).max(2000),
  }),
  z.object({
    action: z.literal("progress"),
    moduleId: z.string().uuid(),
    status: z.enum(["not_started", "in_progress", "completed"]),
  }),
]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ studentId: string }> | { studentId: string } },
) {
  const auth = await requireStaff();
  if ("error" in auth && auth.error) return auth.error;

  const params = await Promise.resolve(ctx.params);
  const studentId = params.studentId;

  try {
    const body = postSchema.parse(await req.json());
    if (body.action === "note") {
      const note = await addStudentNote({
        studentId,
        authorId: auth.user.id,
        body: body.body,
      });
      if (!note) {
        return NextResponse.json({ error: "Could not save note" }, { status: 500 });
      }
      return NextResponse.json({ ok: true, note });
    }

    const ok = await upsertStudentProgress({
      studentId,
      moduleId: body.moduleId,
      status: body.status,
    });
    if (!ok) {
      return NextResponse.json({ error: "Could not update progress" }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
