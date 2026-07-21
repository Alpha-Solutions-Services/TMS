import { getServiceRoleClient } from "@/lib/supabase/service-role";

type VerifyResult =
  | { valid: true; userId: string }
  | { valid: false; userId: string; error: string; status: number };

export async function verifyPasswordForEmail(
  email: string,
  password: string,
): Promise<VerifyResult> {
  const db = getServiceRoleClient();
  if (!db) return { valid: false, userId: "", error: "Auth not configured", status: 503 };

  const { data, error } = await db.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    return {
      valid: false,
      userId: "",
      error: error?.message || "Invalid credentials",
      status: 401,
    };
  }
  return { valid: true, userId: data.user.id };
}
