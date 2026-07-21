import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sendStudentWelcomeEmail } from "@/lib/freight/emails";

const schema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  plan: z.enum(["monthly", "lifetime"]),
});

export async function POST(req: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  const admin = getServiceRoleClient();
  if (!url || !anon || !admin) {
    return NextResponse.json({ error: "Server misconfiguration" }, { status: 500 });
  }

  const cookieStore = await cookies();
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user?.id) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  try {
    const body = schema.parse(await req.json());
    const normalizedEmail = body.email.trim().toLowerCase();

    if ((user.email ?? "").toLowerCase() !== normalizedEmail) {
      return NextResponse.json({ error: "Signed-in email must match enrollment email." }, { status: 422 });
    }

    const { data: existing } = await admin
      .from("profiles")
      .select("enrollment_status")
      .eq("id", user.id)
      .maybeSingle();

    if (existing?.enrollment_status === "paid") {
      return NextResponse.json({ error: "Enrollment already active", success: false }, { status: 409 });
    }

    const { error: upErr } = await admin
      .from("profiles")
      .upsert(
        {
          id: user.id,
          email: normalizedEmail,
          full_name: body.name.trim(),
          role: "student",
          enrollment_status: "pending",
          enrollment_plan: body.plan,
          enrolled_at: new Date().toISOString(),
        },
        { onConflict: "id" },
      );

    if (upErr) {
      console.error("[complete-enrollment-existing] profile", upErr);
      return NextResponse.json({ error: "Profile setup failed", success: false }, { status: 500 });
    }

    await admin.auth.admin
      .updateUserById(user.id, { user_metadata: { role: "student", full_name: body.name.trim() } })
      .catch(() => {});

    await sendStudentWelcomeEmail(
      normalizedEmail,
      body.name.trim(),
      body.plan === "monthly"
        ? "Monthly Access — Alpha Freight Academy (pending payment)"
        : "Lifetime Access — Alpha Freight Academy (pending payment)",
    ).catch(() => {});

    return NextResponse.json({ success: true, userId: user.id, pendingPayment: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[complete-enrollment-existing]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
