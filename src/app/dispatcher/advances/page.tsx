import type { Metadata } from "next";
import { DispatcherAdvancesPage } from "@/components/freight/DispatcherAdvancesPage";

export const metadata: Metadata = {
  title: "Advances & referrals — Dispatcher",
};

export default function Page() {
  return <DispatcherAdvancesPage />;
}
