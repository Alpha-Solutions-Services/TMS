import type { Metadata } from "next";
import { CarrierRegisterClient } from "@/components/freight/CarrierRegisterClient";

export const metadata: Metadata = {
  title: "Carrier registration — Alpha Freight",
  description:
    "Verify your FMCSA MC number against active authority filings before opening an Alpha Freight carrier workspace.",
};

export default function CarrierRegisterPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <CarrierRegisterClient />
    </main>
  );
}
