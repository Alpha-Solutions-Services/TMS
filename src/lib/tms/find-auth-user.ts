import type { User } from "@supabase/supabase-js";
import { getServiceRoleClient } from "@/lib/supabase/service-role";

/** Find auth user by email (paginated — listUsers default page misses many accounts). */
export async function findAuthUserByEmail(emailNorm: string): Promise<User | null> {
  const db = getServiceRoleClient();
  if (!db) return null;

  let page = 1;
  const perPage = 200;

  while (page <= 20) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error("[findAuthUserByEmail] listUsers failed:", error.message);
      return null;
    }

    const users = data.users ?? [];
    const match = users.find((u) => u.email?.trim().toLowerCase() === emailNorm);
    if (match) return match;

    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}
