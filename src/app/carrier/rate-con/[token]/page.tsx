import type { Metadata } from "next";
import { RateConSignClient } from "@/components/freight/RateConSignClient";

export const metadata: Metadata = {
  title: "Rate confirmation — Alpha Freight Network",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default function RateConPage({ params }: { params: { token: string } }) {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <RateConSignClient token={params.token} />
    </main>
  );
}
