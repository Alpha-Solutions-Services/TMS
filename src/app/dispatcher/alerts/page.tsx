import type { Metadata } from "next";
import { DispatcherAlertsPage } from "@/components/freight/DispatcherAlertsPage";

export const metadata: Metadata = {
  title: "Alerts — Dispatcher",
};

export default function AlertsPage() {
  return <DispatcherAlertsPage />;
}
