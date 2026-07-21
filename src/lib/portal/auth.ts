import { cache } from "react";
import { unstable_noStore as noStore } from "next/cache";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

export const getPortalUser = cache(async (): Promise<User | null> => {
  noStore();
  const supabase = await createClient();
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) return null;
  return data.user;
});

export function portalDisplayName(user: User): string {
  const meta = user.user_metadata as Record<string, string> | undefined;
  return (
    meta?.full_name ||
    meta?.name ||
    user.email?.split("@")[0] ||
    "Client"
  );
}
