import type { Metadata } from "next";
import { CarrierAgreementSignClient } from "@/components/freight/CarrierAgreementSignClient";

export const metadata: Metadata = {
  title: "Carrier Agreement — Alpha Freight Network",
  description: "Review and accept the Carrier Dispatch Services Agreement.",
};

export const dynamic = "force-dynamic";

export default function CarrierAgreementTokenPage({
  params,
}: {
  params: { token: string };
}) {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <CarrierAgreementSignClient token={params.token} />
    </main>
  );
}
