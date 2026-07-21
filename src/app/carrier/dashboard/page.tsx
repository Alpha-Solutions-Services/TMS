import type { Metadata } from "next";
import { CarrierDashboardClient } from "@/components/freight/CarrierDashboardClient";

export const metadata: Metadata = {
  title: "Carrier Dashboard — Alpha Freight Network",
  description: "Premium carrier portal — revenue, loads, GPS, payments, and compliance.",
};

export default function CarrierDashboardPage() {
  return <CarrierDashboardClient />;
}
