import type { Metadata } from "next";
import { DriverAcceptInviteClient } from "@/components/freight/DriverAcceptInviteClient";
import { resolveSearchParams } from "@/lib/next/resolve-search-params";

export const metadata: Metadata = {
  title: "Accept driver invite — Alpha Freight",
  robots: { index: false, follow: false },
};

export default async function AcceptDriverInvitePublicPage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }> | { token?: string };
}) {
  const sp = await resolveSearchParams(searchParams);
  const token = sp?.token?.trim() ?? "";
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-xl items-center px-4 py-8">
      <DriverAcceptInviteClient token={token} />
    </main>
  );
}
