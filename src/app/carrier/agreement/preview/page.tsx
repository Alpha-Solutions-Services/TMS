import type { Metadata } from "next";
import { CarrierAgreementDraftPreview } from "@/components/freight/CarrierAgreementDraftPreview";

export const metadata: Metadata = {
  title: "Agreement draft preview — Alpha Freight",
  robots: { index: false, follow: false },
};

/** Public draft preview for stakeholder review before go-live */
export default function CarrierAgreementPreviewPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <CarrierAgreementDraftPreview />
    </main>
  );
}
