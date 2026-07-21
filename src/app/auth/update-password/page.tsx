import type { Metadata } from "next";
import { UpdatePasswordForm } from "@/components/freight/UpdatePasswordForm";

export const metadata: Metadata = {
  title: "Update password — Alpha Freight TMS",
};

export default function UpdatePasswordPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg)] px-4 py-8">
      <UpdatePasswordForm />
    </main>
  );
}
