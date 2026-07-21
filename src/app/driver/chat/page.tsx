import type { Metadata } from "next";
import { Suspense } from "react";
import { DriverChatClient } from "@/components/freight/DriverChatClient";

export const metadata: Metadata = {
  title: "Chat — Driver",
};

export default function DriverChatPage() {
  return (
    <Suspense fallback={<p className="p-8 text-[var(--color-muted)]">Loading chat…</p>}>
      <DriverChatClient />
    </Suspense>
  );
}
