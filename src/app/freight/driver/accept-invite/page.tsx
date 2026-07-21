import type { Metadata } from "next";
import { DriverAcceptInviteClient } from "@/components/freight/DriverAcceptInviteClient";
import { resolveSearchParams } from "@/lib/next/resolve-search-params";

export const metadata: Metadata = {
  title: "Accept driver invite — Alpha Freight",
  robots: { index: false, follow: false },
};

export default async function AcceptDriverInvitePage({
  searchParams,
}: {
  searchParams?: Promise<{ token?: string }> | { token?: string };
}) {
  const sp = await resolveSearchParams(searchParams);
  const token = sp?.token?.trim() ?? "";
  return (
    <main className="mx-auto max-w-xl px-4 pb-28 pt-20">
      <DriverAcceptInviteClient token={token} />
    </main>
  );
}
