import type { Metadata } from "next";
import { CarrierAgreementSignedClient } from "@/components/freight/CarrierAgreementSignedClient";

export const metadata: Metadata = {
  title: "Signed Carrier Agreement — Alpha Freight Network",
  description: "Electronically signed Carrier Dispatch Services Agreement record.",
};

export const dynamic = "force-dynamic";

export default function CarrierAgreementSignedPage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <CarrierAgreementSignedClient token={params.token} />
    </main>
  );
}
