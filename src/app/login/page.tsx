import { Suspense } from "react";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/LoginForm";
import { getPortalUser } from "@/lib/portal/auth";
import { resolveTmsRole, roleHomePath } from "@/lib/tms/auth";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; reason?: string };
}) {
  const user = await getPortalUser();
  if (user) {
    const role = await resolveTmsRole(user);
    if (role) redirect(roleHomePath(role));
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(ellipse_at_top,_rgba(56,163,255,0.12),_transparent_55%)] px-4 py-12">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      {searchParams.error ? (
        <p className="fixed bottom-6 max-w-lg px-4 text-center text-sm text-red-400">
          {searchParams.error === "access"
            ? "Your account is not registered in TMS. Contact a super dispatcher."
            : "Authentication failed"}
          {searchParams.reason ? `: ${searchParams.reason}` : ""}
        </p>
      ) : null}
    </main>
  );
}
