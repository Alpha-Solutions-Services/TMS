"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function FreightSignOutLink() {
  const router = useRouter();
  async function signOut() {
    const sb = createClient();
    await sb?.auth.signOut();
    router.replace("/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={signOut}
      className="mt-8 text-sm font-semibold text-[var(--color-accent)] underline"
    >
      Log out
    </button>
  );
}
