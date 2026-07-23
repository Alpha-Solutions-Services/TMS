import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { verifyPasswordForEmail } from "@/lib/auth/verify-password-for-email";
import { deliverAuthNotifications } from "@/lib/email/auth-notify";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { sendStudentWelcomeEmail } from "@/lib/freight/emails";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2),
  plan: z.enum(["monthly", "lifetime"]),
});

export async function POST(req: NextRequest) {
  const admin = getServiceRoleClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Server misconfiguration" },
      { status: 500 },
    );
  }

  try {
    const body = schema.parse(await req.json());
    const normalizedEmail = body.email.trim().toLowerCase();
    const { data: dup } = await admin.rpc("check_freight_email_registered", {
      candidate: normalizedEmail,
    });

    const studentProfile = {
      email: normalizedEmail,
      full_name: body.name.trim(),
      role: "student" as const,
      enrollment_status: "pending" as const,
      enrollment_plan: body.plan,
      enrolled_at: new Date().toISOString(),
    };

    let userId: string;

    if (dup) {
      const verified = await verifyPasswordForEmail(normalizedEmail, body.password);
      if ("error" in verified) {
        return NextResponse.json(
          { error: verified.error },
          { status: verified.status },
        );
      }
      userId = verified.userId;

      const { data: existingProf } = await admin
        .from("profiles")
        .select("role, enrollment_status")
        .eq("id", userId)
        .maybeSingle();

      const r = existingProf?.role;
      if (r === "carrier" || r === "driver" || r === "dispatcher") {
        return NextResponse.json(
          {
            error:
              "This email is already used for another Alpha Freight role. Use a different email for Academy enrollment.",
          },
          { status: 409 },
        );
      }
      if (r === "student" && existingProf?.enrollment_status === "paid") {
        return NextResponse.json(
          { error: "You already have an active student account. Sign in instead." },
          { status: 409 },
        );
      }

      let profErr: { message?: string } | null = null;
      if (existingProf) {
        const { error } = await admin
          .from("profiles")
          .update(studentProfile)
          .eq("id", userId);
        profErr = error;
      } else {
        const { error } = await admin
          .from("profiles")
          .insert({ id: userId, ...studentProfile });
        profErr = error;
      }

      if (profErr) {
        console.error("[complete-enrollment] profile upsert (existing auth)", profErr);
        return NextResponse.json(
          { error: "Profile setup failed — please contact support" },
          { status: 500 },
        );
      }

      await admin.auth.admin
        .updateUserById(userId, {
          user_metadata: { role: "student", full_name: body.name.trim() },
        })
        .catch(() => {});
    } else {
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email: normalizedEmail,
          password: body.password,
          email_confirm: true,
          user_metadata: { role: "student", full_name: body.name.trim() },
        });

      if (createErr || !created.user) {
        console.error("[complete-enrollment] createUser", createErr);
        return NextResponse.json(
          { error: "Unable to finish account signup" },
          { status: 500 },
        );
      }

      userId = created.user.id;

      const { error: profErr } = await admin
        .from("profiles")
        .insert({ id: userId, ...studentProfile });

      if (profErr) {
        console.error("[complete-enrollment] profile", profErr);
        await admin.auth.admin.deleteUser(userId);
        return NextResponse.json(
          { error: "Profile setup failed — please contact support" },
          { status: 500 },
        );
      }
    }

    await sendStudentWelcomeEmail(
      normalizedEmail,
      body.name.trim(),
      body.plan === "monthly"
        ? "Monthly Access — Alpha Freight Academy (pending payment)"
        : "Lifetime Access — Alpha Freight Academy (pending payment)",
    );

    await deliverAuthNotifications({
      kind: "signup",
      userId,
      email: normalizedEmail,
      profileRole: "student",
      detail: "Student account created — payment pending activation.",
    });

    return NextResponse.json({ success: true, userId, pendingPayment: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[complete-enrollment]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
