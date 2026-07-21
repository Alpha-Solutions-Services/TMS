"use client";

import clsx from "clsx";
import type { PortalProject } from "@/lib/sanity/portal-data";

function StatusBadge({ status }: { status: string }) {
  const variant =
    status === "Completed"
      ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300"
      : status === "In Progress"
        ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
        : "border-[var(--color-border)] bg-[var(--color-bg)]/50 text-[var(--color-muted)]";
  return (
    <span
      className={clsx(
        "rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        variant
      )}
    >
      {status}
    </span>
  );
}

function ProgressBar({ value }: { value: number }) {
  const v = Math.min(100, Math.max(0, value));
  return (
    <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--color-border)]">
      <div
        className="h-full rounded-full bg-[var(--color-accent)] transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}

export function ProjectCard({
  project,
  compact = false,
}: {
  project: PortalProject;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4 transition-shadow hover:shadow-md">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-[var(--color-text)]">
            {project.name}
          </h3>
          <StatusBadge status={project.status} />
        </div>
        {project.description ? (
          <p className="mt-2 line-clamp-2 text-sm text-[var(--color-muted)]">
            {project.description}
          </p>
        ) : null}
        <div className="mt-4">
          <div className="mb-1 flex justify-between text-xs text-[var(--color-muted)]">
            <span>Progress</span>
            <span>{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30">
      <div className="border-b border-[var(--color-border)] p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <h3
              className="text-xl font-bold text-[var(--color-text)]"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {project.name}
            </h3>
            {project.description ? (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                {project.description}
              </p>
            ) : null}
          </div>
          <StatusBadge status={project.status} />
        </div>
      </div>
      <div className="space-y-6 p-6">
        <div className="grid gap-6 md:grid-cols-2">
          <div>
            <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
              Project details
            </h4>
            <div className="space-y-2 text-sm text-[var(--color-muted)]">
              <p>
                <span className="font-medium text-[var(--color-text)]">
                  Category:
                </span>{" "}
                {project.category}
              </p>
              {project.url ? (
                <p>
                  <span className="font-medium text-[var(--color-text)]">
                    URL:
                  </span>{" "}
                  <a
                    href={project.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[var(--color-accent)] hover:underline"
                  >
                    {project.url}
                  </a>
                </p>
              ) : null}
              {project.dueDate ? (
                <p>
                  <span className="font-medium text-[var(--color-text)]">
                    Due date:
                  </span>{" "}
                  {project.dueDate}
                </p>
              ) : null}
              <p>
                <span className="font-medium text-[var(--color-text)]">
                  Team:
                </span>{" "}
                {(project.team ?? []).join(", ")}
              </p>
            </div>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
              Technologies
            </h4>
            <div className="flex flex-wrap gap-2">
              {project.technologies.length ? (
                project.technologies.map((tech) => (
                  <span
                    key={tech}
                    className="rounded-md border border-[var(--color-border)] bg-[var(--color-bg)]/50 px-2 py-1 text-xs text-[var(--color-text)]"
                  >
                    {tech}
                  </span>
                ))
              ) : (
                <span className="text-sm text-[var(--color-muted)]">—</span>
              )}
            </div>
          </div>
        </div>

        <div>
          <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
            Progress
          </h4>
          <div className="mb-1 flex justify-between text-sm text-[var(--color-muted)]">
            <span>Overall</span>
            <span>{project.progress}%</span>
          </div>
          <ProgressBar value={project.progress} />
        </div>

        {project.milestones.length > 0 ? (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
              Milestones
            </h4>
            <div className="space-y-2">
              {project.milestones.map((m, idx) => (
                <div
                  key={`${m.name}-${idx}`}
                  className="flex items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] p-3"
                >
                  <span className="text-sm text-[var(--color-text)]">
                    {m.name}
                  </span>
                  <span className="shrink-0 rounded border border-[var(--color-border)] px-2 py-0.5 text-xs capitalize text-[var(--color-muted)]">
                    {(m.status || "pending").replaceAll("-", " ")}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : null}

        {project.recentUpdates.length > 0 ? (
          <div>
            <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">
              Recent updates
            </h4>
            <div className="space-y-3">
              {project.recentUpdates.map((u, idx) => (
                <div
                  key={`${u.date}-${idx}`}
                  className="rounded-lg border border-[var(--color-border)] p-3"
                >
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {u.message}
                  </p>
                  <div className="mt-1 flex justify-between text-xs text-[var(--color-muted)]">
                    <span>{u.author ? `By ${u.author}` : ""}</span>
                    <span>{u.date || ""}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
