import type { Metadata } from "next";
import { DispatcherReportsPage } from "@/components/freight/DispatcherReportsPage";

export const metadata: Metadata = {
  title: "Reports — Dispatcher",
};

export default function ReportsPage() {
  return <DispatcherReportsPage />;
}
