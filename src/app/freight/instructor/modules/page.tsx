import type { Metadata } from "next";
import { listPublishedModules } from "@/lib/freight/academy-db";

export const metadata: Metadata = {
  title: "Modules — Instructor",
};

export const dynamic = "force-dynamic";

export default async function InstructorModulesPage() {
  const modules = await listPublishedModules();

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Course modules
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Published academy modules students work through. Assign progress from the Students tab.
        </p>
      </div>
      <ol className="space-y-3">
        {modules.length === 0 ? (
          <li className="rounded-2xl border border-[var(--color-border)] p-6 text-sm text-[var(--color-muted)]">
            No modules yet. Run <code className="text-[var(--color-accent)]">supabase/academy-schema.sql</code> to seed starters.
          </li>
        ) : (
          modules.map((m) => (
            <li
              key={m.id as string}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-5 py-4"
            >
              <p className="text-sm font-semibold text-[var(--color-text)]">
                {(m.sort_order as number) ?? 0}. {m.title as string}
              </p>
              {m.summary ? (
                <p className="mt-1 text-sm text-[var(--color-muted)]">{m.summary as string}</p>
              ) : null}
            </li>
          ))
        )}
      </ol>
    </div>
  );
}
