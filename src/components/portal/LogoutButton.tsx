"use client";

import { createClient } from "@/lib/supabase/client";

export function LogoutButton({ redirectTo = "/login" }: { redirectTo?: string }) {
  async function logout() {
    const supabase = createClient();
    if (supabase) await supabase.auth.signOut();
    window.location.href = redirectTo;
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
    >
      Sign out
    </button>
  );
}
