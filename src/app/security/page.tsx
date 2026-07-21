import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaSettingsPanel } from "@/components/freight/MfaSettingsPanel";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Security — Alpha Freight TMS",
};

export const dynamic = "force-dynamic";

export default async function SecurityPage() {
  const sb = await createClient();
  if (!sb) redirect("/login");
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) redirect("/login");

  return (
    <main className="min-h-[100dvh] bg-[var(--color-bg)] px-4 py-8 sm:px-6">
      <div className="mx-auto max-w-lg space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">Account security</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">{user.email}</p>
        </div>
        <MfaSettingsPanel />
        <p className="text-xs text-[var(--color-muted)]">
          After enabling 2FA, you will be asked for a code each time you sign in with email/password.
        </p>
      </div>
    </main>
  );
}
