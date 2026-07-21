import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sanitizeText } from "./api-security";

export type AcademyStudentRow = {
  id: string;
  email: string;
  fullName: string;
  enrollmentStatus: string;
  enrollmentPlan: string;
  enrolledAt: string | null;
  paymentConfirmedAt: string | null;
  paymentNotes: string;
};

export async function listAcademyStudents(filter?: {
  status?: string;
}): Promise<AcademyStudentRow[]> {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  let query = admin
    .from("profiles")
    .select(
      "id,email,full_name,enrollment_status,enrollment_plan,enrolled_at,payment_confirmed_at,payment_notes",
    )
    .eq("role", "student")
    .order("enrolled_at", { ascending: false, nullsFirst: false });

  if (filter?.status) {
    query = query.eq("enrollment_status", filter.status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[academy-students] list failed:", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id as string,
    email: (row.email as string) ?? "",
    fullName: (row.full_name as string) ?? "",
    enrollmentStatus: (row.enrollment_status as string) ?? "unpaid",
    enrollmentPlan: (row.enrollment_plan as string) ?? "",
    enrolledAt: (row.enrolled_at as string) ?? null,
    paymentConfirmedAt: (row.payment_confirmed_at as string) ?? null,
    paymentNotes: (row.payment_notes as string) ?? "",
  }));
}

export async function setStudentEnrollmentStatus(params: {
  studentId: string;
  status: "pending" | "paid" | "unpaid" | "refunded";
  confirmedBy: string;
  notes?: string;
}): Promise<AcademyStudentRow | null> {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const patch: Record<string, unknown> = {
    enrollment_status: params.status,
    payment_notes: params.notes ? sanitizeText(params.notes, 500) : null,
  };

  if (params.status === "paid") {
    patch.payment_confirmed_at = new Date().toISOString();
    patch.payment_confirmed_by = params.confirmedBy;
    if (!patch.enrolled_at) {
      /* keep existing enrolled_at */
    }
  }

  if (params.status === "unpaid" || params.status === "pending") {
    patch.payment_confirmed_at = null;
    patch.payment_confirmed_by = null;
  }

  const { data, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", params.studentId)
    .eq("role", "student")
    .select(
      "id,email,full_name,enrollment_status,enrollment_plan,enrolled_at,payment_confirmed_at,payment_notes",
    )
    .maybeSingle();

  if (error || !data) {
    console.error("[academy-students] update failed:", error);
    return null;
  }

  return {
    id: data.id as string,
    email: (data.email as string) ?? "",
    fullName: (data.full_name as string) ?? "",
    enrollmentStatus: (data.enrollment_status as string) ?? "unpaid",
    enrollmentPlan: (data.enrollment_plan as string) ?? "",
    enrolledAt: (data.enrolled_at as string) ?? null,
    paymentConfirmedAt: (data.payment_confirmed_at as string) ?? null,
    paymentNotes: (data.payment_notes as string) ?? "",
  };
}

export async function listPublishedModules() {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("academy_modules")
    .select("id,sort_order,title,summary,is_published")
    .eq("is_published", true)
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("[academy-modules] list failed:", error);
    return [];
  }
  return data ?? [];
}

export async function listStudentProgress(studentId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("academy_progress")
    .select("id,module_id,status,instructor_note,updated_at")
    .eq("student_id", studentId);

  if (error) {
    console.error("[academy-progress] list failed:", error);
    return [];
  }
  return data ?? [];
}

export async function upsertStudentProgress(params: {
  studentId: string;
  moduleId: string;
  status: "not_started" | "in_progress" | "completed";
  instructorNote?: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return false;

  const { error } = await admin.from("academy_progress").upsert(
    {
      student_id: params.studentId,
      module_id: params.moduleId,
      status: params.status,
      instructor_note: params.instructorNote
        ? sanitizeText(params.instructorNote, 500)
        : null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "student_id,module_id" },
  );

  if (error) {
    console.error("[academy-progress] upsert failed:", error);
    return false;
  }
  return true;
}

export async function addStudentNote(params: {
  studentId: string;
  authorId: string;
  body: string;
}) {
  const admin = getServiceRoleClient();
  if (!admin) return null;

  const { data, error } = await admin
    .from("academy_student_notes")
    .insert({
      student_id: params.studentId,
      author_id: params.authorId,
      body: sanitizeText(params.body, 2000),
    })
    .select("id,created_at,body,author_id")
    .single();

  if (error) {
    console.error("[academy-notes] insert failed:", error);
    return null;
  }
  return data;
}

export async function listStudentNotes(studentId: string) {
  const admin = getServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("academy_student_notes")
    .select("id,created_at,body,author_id")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[academy-notes] list failed:", error);
    return [];
  }
  return data ?? [];
}
