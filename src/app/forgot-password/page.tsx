import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/freight/ForgotPasswordForm";

export const metadata: Metadata = {
  title: "Forgot password — Alpha Freight TMS",
};

export default function ForgotPasswordPage() {
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[var(--color-bg)] px-4 py-8">
      <ForgotPasswordForm />
    </main>
  );
}
