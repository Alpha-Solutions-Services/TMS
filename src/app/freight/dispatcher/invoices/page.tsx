import type { Metadata } from "next";
import { Suspense } from "react";
import { DispatcherInvoicesPage } from "@/components/freight/DispatcherInvoicesPage";

export const metadata: Metadata = {
  title: "Invoices — Dispatcher",
};

export default function InvoicesPage() {
  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading…</p>}>
      <DispatcherInvoicesPage />
    </Suspense>
  );
}
