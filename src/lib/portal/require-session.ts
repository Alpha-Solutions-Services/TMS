import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

export async function getSessionUser(): Promise<
  { user: User } | { error: NextResponse }
> {
  const supabase = await createClient();
  if (!supabase) {
    return {
      error: NextResponse.json(
        { error: "Portal auth is not configured" },
        { status: 503 }
      ),
    };
  }
  const { data, error } = await supabase.auth.getUser();
  const user = data?.user ?? null;
  if (error || !user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { user };
}
