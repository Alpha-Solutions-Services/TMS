import type { Metadata } from "next";
import Link from "next/link";
import { resolveSearchParams } from "@/lib/next/resolve-search-params";
import { createClient } from "@/lib/supabase/server";
import {
  listPublishedModules,
  listStudentNotes,
  listStudentProgress,
} from "@/lib/freight/academy-db";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Student Dashboard — Alpha Freight",
  description:
    "Lessons, quizzes, drills, and your practice board — centralized for enrolled students.",
};

export default async function StudentDashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ welcome?: string }> | { welcome?: string };
}) {
  const sp = await resolveSearchParams(searchParams);
  const sb = await createClient();
  const {
    data: { user },
  } = sb ? await sb.auth.getUser() : { data: { user: null } };

  const modules = await listPublishedModules();
  const progressRows = user?.id ? await listStudentProgress(user.id) : [];
  const notes = user?.id ? await listStudentNotes(user.id) : [];
  const progressMap = new Map(
    progressRows.map((p) => [p.module_id as string, p.status as string]),
  );

  const completed = modules.filter(
    (m) => progressMap.get(m.id as string) === "completed",
  ).length;

  return (
    <main className="min-h-[70vh] bg-[var(--color-bg)] px-4 pb-24 pt-12 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-8">
        {sp?.welcome ? (
          <p className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Welcome — your payment was accepted. Work through the modules below; your instructor will update progress and leave notes.
          </p>
        ) : null}

        <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-8 sm:p-10">
          <h1
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Academy studio
          </h1>
          <p className="mt-3 text-sm text-[var(--color-muted)]">
            {completed} of {modules.length} modules completed. Questions? Email{" "}
            <a
              href="mailto:info@alphasolutions.software"
              className="text-[var(--color-accent)] hover:underline"
            >
              info@alphasolutions.software
            </a>
            .
          </p>

          <ol className="mt-8 space-y-3">
            {modules.length === 0 ? (
              <li className="text-sm text-[var(--color-muted)]">
                Modules will appear here after the academy schema is installed.
              </li>
            ) : (
              modules.map((m) => {
                const status = progressMap.get(m.id as string) ?? "not_started";
                return (
                  <li
                    key={m.id as string}
                    className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-4 py-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-[var(--color-text)]">
                          {(m.sort_order as number) ?? 0}. {m.title as string}
                        </p>
                        {m.summary ? (
                          <p className="mt-1 text-xs text-[var(--color-muted)]">
                            {m.summary as string}
                          </p>
                        ) : null}
                      </div>
                      <span
                        className={
                          status === "completed"
                            ? "rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-emerald-300"
                            : status === "in_progress"
                              ? "rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-amber-300"
                              : "rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]"
                        }
                      >
                        {status.replace("_", " ")}
                      </span>
                    </div>
                  </li>
                );
              })
            )}
          </ol>
        </div>

        {notes.length > 0 ? (
          <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-8">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Instructor notes
            </h2>
            <ul className="mt-4 space-y-3">
              {notes.map((n) => (
                <li
                  key={n.id as string}
                  className="rounded-xl border border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-muted)]"
                >
                  <p className="text-[var(--color-text)]">{n.body as string}</p>
                  <p className="mt-1 text-[10px]">
                    {new Date(n.created_at as string).toLocaleString()}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <Link
          href="/freight/student"
          className="inline-flex text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]"
        >
          ← Syllabus preview
        </Link>
      </div>
    </main>
  );
}
