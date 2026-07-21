import type { Metadata } from "next";
import { DriverDashboardClient } from "@/components/freight/DriverDashboardClient";

export const metadata: Metadata = {
  title: "Driver Dashboard — Alpha Freight",
};

export default function DriverDashboardPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <DriverDashboardClient />
    </main>
  );
}
