import type { Metadata } from "next";
import { DispatcherDashboardClient } from "@/components/freight/DispatcherDashboardClient";

export const metadata: Metadata = {
  title: "Dispatcher Dashboard — Alpha Freight",
  description:
    "Live dispatch metrics, load board, revenue, and fleet overview synced from your Google Dispatch Sheet.",
};

export default function DispatcherDashboardPage() {
  return <DispatcherDashboardClient />;
}
