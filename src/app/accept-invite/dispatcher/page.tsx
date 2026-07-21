import type { Metadata } from "next";
import { Suspense } from "react";
import { DispatcherAcceptInviteClient } from "@/components/freight/DispatcherAcceptInviteClient";
import { resolveSearchParams } from "@/lib/next/resolve-search-params";

export const metadata: Metadata = {
  title: "Accept invite — Alpha Freight TMS",
  robots: { index: false, follow: false },
};

export default async function AcceptDispatcherInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }> | { token?: string };
}) {
  const sp = await resolveSearchParams(searchParams);
  const token = sp?.token?.trim() ?? "";
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg)] px-4 py-8">
      <div className="w-full max-w-lg">
        <Suspense fallback={<p className="text-center text-sm text-[var(--color-muted)]">Loading…</p>}>
          <DispatcherAcceptInviteClient token={token} />
        </Suspense>
      </div>
    </main>
  );
}
