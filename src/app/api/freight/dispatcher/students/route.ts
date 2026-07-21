import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  listAcademyStudents,
  setStudentEnrollmentStatus,
} from "@/lib/freight/academy-db";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireDispatcher() {
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

  if (!me || (me.role !== "dispatcher" && me.role !== "instructor")) {
    return { error: NextResponse.json({ error: "Staff only" }, { status: 403 }) };
  }

  return { user, role: me.role as string };
}

export async function GET(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth && auth.error) return auth.error;

  const status = req.nextUrl.searchParams.get("status") ?? undefined;
  const students = await listAcademyStudents(
    status ? { status } : undefined,
  );

  return NextResponse.json({ students });
}

const patchSchema = z.object({
  studentId: z.string().uuid(),
  status: z.enum(["pending", "paid", "unpaid", "refunded"]),
  notes: z.string().max(500).optional(),
});

export async function PATCH(req: NextRequest) {
  const auth = await requireDispatcher();
  if ("error" in auth && auth.error) return auth.error;

  // Only dispatcher can mark payment accepted
  if (auth.role !== "dispatcher") {
    return NextResponse.json(
      { error: "Only dispatchers can approve academy payments" },
      { status: 403 },
    );
  }

  try {
    const body = patchSchema.parse(await req.json());
    const updated = await setStudentEnrollmentStatus({
      studentId: body.studentId,
      status: body.status,
      confirmedBy: auth.user.id,
      notes: body.notes,
    });
    if (!updated) {
      return NextResponse.json({ error: "Student not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true, student: updated });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }
    console.error("[dispatcher/students PATCH]", e);
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}
