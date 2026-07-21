import type { Metadata } from "next";
import Link from "next/link";
import { listAcademyStudents, listPublishedModules } from "@/lib/freight/academy-db";

export const metadata: Metadata = {
  title: "Instructor Dashboard — Alpha Academy",
};

export const dynamic = "force-dynamic";

export default async function InstructorDashboardPage() {
  const [students, modules] = await Promise.all([
    listAcademyStudents({ status: "paid" }),
    listPublishedModules(),
  ]);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Instructor dashboard
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Coordinate academy students — same Alpha theme across all portals.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <p className="text-xs uppercase text-[var(--color-muted)]">Active students</p>
          <p className="mt-2 text-3xl font-bold text-[var(--color-accent)]">{students.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <p className="text-xs uppercase text-[var(--color-muted)]">Published modules</p>
          <p className="mt-2 text-3xl font-bold text-[var(--color-text)]">{modules.length}</p>
        </div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
          <p className="text-xs uppercase text-[var(--color-muted)]">Quick link</p>
          <Link
            href="/freight/instructor/students"
            className="mt-3 inline-flex text-sm font-semibold text-[var(--color-accent)] hover:underline"
          >
            Open student coordination →
          </Link>
        </div>
      </div>
    </div>
  );
}
