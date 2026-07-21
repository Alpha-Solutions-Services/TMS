import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getServiceRoleClient } from "@/lib/supabase/service-role";
import { isSuperAdminEmail } from "@/lib/admin-allowlist";

const schema = z.object({
  role: z.enum(["dispatcher", "carrier", "student", "instructor"]),
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
        cookiesToSet.forEach(({ name, value, options }) =>
          cookieStore.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.id || !isSuperAdminEmail(user.email)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = schema.parse(await req.json());
    const { error } = await admin.from("profiles").update({ role: body.role }).eq("id", user.id);
    if (error) {
      return NextResponse.json({ error: "Unable to update role" }, { status: 500 });
    }
    await admin.auth.admin.updateUserById(user.id, { user_metadata: { role: body.role } }).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }
    console.error("[superadmin-set-role]", e);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

