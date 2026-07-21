"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  Circle,
  Clock3,
  ExternalLink,
  GitBranch,
  Loader2,
  MessageSquarePlus,
  Pause,
  Pencil,
  Play,
  Trash2,
  Users,
} from "lucide-react";
import clsx from "clsx";
import { useUiOptional } from "@/components/ui/UiProvider";

export type CrmProject = {
  id: string;
  title: string;
  description?: string | null;
  status: string;
  progress: number;
  category?: string | null;
  project_url?: string | null;
  client_email?: string | null;
  updated_at?: string;
  milestones?: Array<{
    id?: string;
    title: string;
    status: string;
    due_date?: string | null;
    requires_approval?: boolean;
    approval_status?: string | null;
    client_note?: string | null;
  }>;
  team?: Array<{ id?: string; name: string; role?: string | null }>;
  updates?: Array<{
    id?: string;
    title?: string | null;
    body: string;
    author?: string | null;
    is_client?: boolean;
    created_at?: string;
  }>;
};

const statusLabel: Record<string, string> = {
  planning: "Planning",
  in_progress: "In progress",
  review: "In review",
  completed: "Completed",
  on_hold: "On hold",
};

type Props = {
  project: CrmProject;
  mode?: "client" | "admin";
  onRefresh?: (project: CrmProject) => void;
  onDeleted?: () => void;
};

export function ProjectProgressView({
  project,
  mode = "client",
  onRefresh,
  onDeleted,
}: Props) {
  const ui = useUiOptional();
  const [comment, setComment] = useState("");
  const [commentBusy, setCommentBusy] = useState(false);
  const [commentError, setCommentError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({
    title: project.title,
    description: project.description || "",
    status: project.status,
    progress: project.progress,
    category: project.category || "",
    projectUrl: project.project_url || "",
    clientEmail: project.client_email || "",
  });

  const milestones = [...(project.milestones || [])];
  const updates = [...(project.updates || [])].sort((a, b) =>
    (b.created_at || "").localeCompare(a.created_at || "")
  );

  async function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    setCommentBusy(true);
    setCommentError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: comment.trim() }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Comment failed");
      setComment("");
      const refreshRes = await fetch(`/api/projects/${project.id}`);
      const refreshJ = (await refreshRes.json()) as { project?: CrmProject };
      if (refreshJ.project) onRefresh?.(refreshJ.project);
    } catch (err) {
      setCommentError(err instanceof Error ? err.message : "Failed");
    } finally {
      setCommentBusy(false);
    }
  }

  async function patchProject(body: Record<string, unknown>) {
    setActionBusy(JSON.stringify(body));
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { error?: string; project?: CrmProject };
      if (!res.ok) throw new Error(j.error || "Update failed");
      if (j.project) {
        onRefresh?.(j.project);
        setEditForm({
          title: j.project.title,
          description: j.project.description || "",
          status: j.project.status,
          progress: j.project.progress,
          category: j.project.category || "",
          projectUrl: j.project.project_url || "",
          clientEmail: j.project.client_email || "",
        });
      }
      setEditing(false);
    } catch (err) {
      ui?.toast({
        kind: "error",
        title: "Update failed",
        message: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setActionBusy(null);
    }
  }

  async function deleteProject() {
    const ok = ui
      ? await ui.confirm({
          title: "Delete project?",
          message: `“${project.title}” will be permanently removed. This cannot be undone.`,
          confirmLabel: "Delete project",
          danger: true,
        })
      : window.confirm(`Delete "${project.title}"? This cannot be undone.`);
    if (!ok) return;
    setActionBusy("delete");
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Delete failed");
      ui?.toast({ kind: "success", title: "Project deleted" });
      onDeleted?.();
    } catch (err) {
      ui?.toast({
        kind: "error",
        title: "Delete failed",
        message: err instanceof Error ? err.message : "Try again",
      });
    } finally {
      setActionBusy(null);
    }
  }

  const isPaused = project.status === "on_hold";

  return (
    <div className="space-y-8">
      {mode === "admin" ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] hover:border-[var(--color-accent)]/50"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit
          </button>
          {isPaused ? (
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={() => void patchProject({ action: "resume" })}
              className="inline-flex items-center gap-1 rounded-lg border border-emerald-500/40 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/10 disabled:opacity-50"
            >
              {actionBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Resume
            </button>
          ) : (
            <button
              type="button"
              disabled={!!actionBusy}
              onClick={() => void patchProject({ action: "pause" })}
              className="inline-flex items-center gap-1 rounded-lg border border-amber-500/40 px-3 py-1.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {actionBusy ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Pause className="h-3.5 w-3.5" />
              )}
              Pause
            </button>
          )}
          <button
            type="button"
            disabled={!!actionBusy}
            onClick={() => void deleteProject()}
            className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs font-semibold text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            {actionBusy === "delete" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Delete
          </button>
        </div>
      ) : null}

      {mode === "admin" && editing ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void patchProject({
              title: editForm.title,
              description: editForm.description || null,
              status: editForm.status,
              progress: editForm.progress,
              category: editForm.category || null,
              projectUrl: editForm.projectUrl || null,
              clientEmail: editForm.clientEmail,
            });
          }}
          className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5 md:grid-cols-2"
        >
          <input
            required
            value={editForm.title}
            onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm md:col-span-2"
            placeholder="Title"
          />
          <input
            type="email"
            value={editForm.clientEmail}
            onChange={(e) =>
              setEditForm({ ...editForm, clientEmail: e.target.value })
            }
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            placeholder="Client email"
          />
          <select
            value={editForm.status}
            onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          >
            <option value="planning">Planning</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On hold</option>
          </select>
          <input
            value={editForm.category}
            onChange={(e) => setEditForm({ ...editForm, category: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
            placeholder="Category"
          />
          <input
            value={editForm.projectUrl}
            onChange={(e) =>
              setEditForm({ ...editForm, projectUrl: e.target.value })
            }
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm md:col-span-2"
            placeholder="Live site URL"
          />
          <textarea
            value={editForm.description}
            onChange={(e) =>
              setEditForm({ ...editForm, description: e.target.value })
            }
            rows={3}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm md:col-span-2"
            placeholder="Description"
          />
          <label className="text-sm text-[var(--color-muted)] md:col-span-2">
            Progress: {editForm.progress}%
            <input
              type="range"
              min={0}
              max={100}
              value={editForm.progress}
              onChange={(e) =>
                setEditForm({ ...editForm, progress: Number(e.target.value) })
              }
              className="mt-1 w-full"
            />
          </label>
          <div className="flex gap-2 md:col-span-2">
            <button
              type="submit"
              disabled={!!actionBusy}
              className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
            >
              Save changes
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-muted)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      <motion.header
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--color-border)] bg-[radial-gradient(ellipse_at_top,_rgba(56,163,255,0.12),_transparent_60%)] p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
              {project.category || "Project"}
            </p>
            <h2
              className="mt-1 text-2xl font-bold text-[var(--color-text)] md:text-3xl"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              {project.title}
            </h2>
            {project.description ? (
              <p className="mt-2 max-w-2xl text-sm text-[var(--color-muted)]">
                {project.description}
              </p>
            ) : null}
          </div>
          <span
            className={clsx(
              "rounded-full border px-3 py-1 text-xs font-semibold",
              project.status === "on_hold"
                ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                : "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-accent)]"
            )}
          >
            {statusLabel[project.status] || project.status}
          </span>
        </div>

        <div className="mt-6">
          <div className="mb-2 flex items-center justify-between text-xs text-[var(--color-muted)]">
            <span className="inline-flex items-center gap-1">
              <GitBranch className="h-3.5 w-3.5" /> Progress
            </span>
            <span className="font-semibold text-[var(--color-text)]">
              {project.progress}%
            </span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-[var(--color-border)]">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${project.progress}%` }}
              transition={{ duration: 0.8, ease: "easeOut" }}
              className="h-full rounded-full bg-[var(--color-accent)] shadow-[var(--glow-sm)]"
            />
          </div>
        </div>

        {project.project_url ? (
          <a
            href={project.project_url}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 text-sm text-[var(--color-accent)] hover:underline"
          >
            Open live site <ExternalLink className="h-3.5 w-3.5" />
          </a>
        ) : null}
      </motion.header>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <CheckCircle2 className="h-4 w-4 text-[var(--color-accent)]" />
            Milestones
          </h3>
          <ul className="space-y-3">
            {milestones.length === 0 ? (
              <li className="text-sm text-[var(--color-muted)]">
                Milestones will appear as the team plans the work.
              </li>
            ) : (
              milestones.map((m, i) => (
                <li key={m.id || i} className="flex items-start gap-3 text-sm">
                  {m.status === "done" || m.approval_status === "approved" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-400" />
                  ) : m.status === "in_progress" ? (
                    <Clock3 className="mt-0.5 h-4 w-4 text-amber-300" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p
                      className={clsx(
                        "font-medium",
                        m.status === "done"
                          ? "text-[var(--color-muted)] line-through"
                          : "text-[var(--color-text)]"
                      )}
                    >
                      {m.title}
                    </p>
                    {m.due_date ? (
                      <p className="text-xs text-[var(--color-muted)]">
                        Due {m.due_date}
                      </p>
                    ) : null}
                    {m.approval_status && m.approval_status !== "none" ? (
                      <p className="mt-0.5 text-[11px] text-[var(--color-accent)]">
                        Approval: {m.approval_status.replace("_", " ")}
                      </p>
                    ) : null}
                    {mode === "admin" && m.id ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                          onClick={() =>
                            void fetch("/api/milestones", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                milestoneId: m.id,
                                action: "request_approval",
                              }),
                            }).then(async () => {
                              const r = await fetch(`/api/projects/${project.id}`);
                              const j = await r.json();
                              if (j.project) onRefresh?.(j.project);
                              ui?.toast({
                                kind: "success",
                                title: "Approval requested",
                              });
                            })
                          }
                        >
                          Request approval
                        </button>
                      </div>
                    ) : null}
                    {mode === "client" &&
                    m.id &&
                    m.approval_status === "pending" ? (
                      <div className="mt-2 flex flex-wrap gap-1">
                        <button
                          type="button"
                          className="rounded-lg bg-[var(--color-accent)] px-2 py-0.5 text-[10px] font-semibold text-[#05080f]"
                          onClick={() =>
                            void fetch("/api/milestones", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                milestoneId: m.id,
                                action: "approve",
                              }),
                            }).then(async () => {
                              const r = await fetch(`/api/projects/${project.id}`);
                              const j = await r.json();
                              if (j.project) onRefresh?.(j.project);
                              ui?.toast({
                                kind: "success",
                                title: "Milestone approved",
                              });
                            })
                          }
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          className="rounded-lg border border-[var(--color-border)] px-2 py-0.5 text-[10px] text-[var(--color-muted)]"
                          onClick={() =>
                            void fetch("/api/milestones", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                milestoneId: m.id,
                                action: "request_changes",
                                note: "Changes requested",
                              }),
                            }).then(async () => {
                              const r = await fetch(`/api/projects/${project.id}`);
                              const j = await r.json();
                              if (j.project) onRefresh?.(j.project);
                              ui?.toast({
                                kind: "info",
                                title: "Changes requested",
                              });
                            })
                          }
                        >
                          Request changes
                        </button>
                      </div>
                    ) : null}
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5">
          <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
            <Users className="h-4 w-4 text-[var(--color-accent)]" />
            Team on this project
          </h3>
          <ul className="space-y-3">
            {(project.team || []).length === 0 ? (
              <li className="text-sm text-[var(--color-muted)]">
                Your dedicated team will be listed here.
              </li>
            ) : (
              (project.team || []).map((t, i) => (
                <li
                  key={t.id || i}
                  className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)]/40 px-3 py-2"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-accent-dim)] text-sm font-bold text-[var(--color-accent)]">
                    {t.name.slice(0, 1).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
                      {t.name}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {t.role || "Team"}
                    </p>
                  </div>
                </li>
              ))
            )}
          </ul>
        </section>
      </div>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold text-[var(--color-text)]">
          <MessageSquarePlus className="h-4 w-4 text-[var(--color-accent)]" />
          Activity & comments
        </h3>
        <ol className="relative mb-6 space-y-4 border-l border-[var(--color-border)] pl-5">
          {updates.length === 0 ? (
            <li className="text-sm text-[var(--color-muted)]">No updates yet.</li>
          ) : (
            updates.map((u, i) => (
              <li key={u.id || i} className="relative">
                <span
                  className={clsx(
                    "absolute -left-[1.4rem] top-1 h-2.5 w-2.5 rounded-full",
                    u.is_client ? "bg-emerald-400" : "bg-[var(--color-accent)]"
                  )}
                />
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {u.title || "Update"}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-muted)]">
                  {u.body}
                </p>
                <p className="mt-1 text-[11px] text-[var(--color-muted)]">
                  {u.author || (u.is_client ? "You" : "Team")}
                  {u.created_at
                    ? ` · ${new Date(u.created_at).toLocaleString()}`
                    : ""}
                </p>
              </li>
            ))
          )}
        </ol>

        <form onSubmit={(e) => void postComment(e)} className="space-y-2">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={3}
            placeholder={
              mode === "admin"
                ? "Post an update or comment for the client…"
                : "Ask a question or leave a comment for the team…"
            }
            className="w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)]"
          />
          {commentError ? (
            <p className="text-xs text-red-400">{commentError}</p>
          ) : null}
          <button
            type="submit"
            disabled={commentBusy || !comment.trim()}
            className="inline-flex items-center gap-1 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            {commentBusy ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageSquarePlus className="h-4 w-4" />
            )}
            Post comment
          </button>
        </form>
      </section>
    </div>
  );
}
