import type { Metadata } from "next";
import { DriverDashboardClient } from "@/components/freight/DriverDashboardClient";

export const metadata: Metadata = {
  title: "Driver Dashboard — Alpha Freight",
};

export default function DriverDashboardPage() {
  return <DriverDashboardClient />;
}
