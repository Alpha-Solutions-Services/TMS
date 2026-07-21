"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import {
  ProjectProgressView,
  type CrmProject,
} from "@/components/portal/ProjectProgressView";

export function AdminProjectsPanel() {
  const [projects, setProjects] = useState<CrmProject[]>([]);
  const [selected, setSelected] = useState<CrmProject | null>(null);
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    clientEmail: "",
    progress: 10,
    status: "planning",
    teamName: "Project Lead",
    teamRole: "Account manager",
    milestone: "Kickoff & discovery",
  });

  const load = useCallback(async () => {
    const res = await fetch("/api/projects");
    const j = (await res.json()) as { projects?: CrmProject[] };
    const list = j.projects ?? [];
    setProjects(list);
    if (selected) {
      const updated = list.find((p) => p.id === selected.id);
      if (updated) setSelected(updated);
    }
  }, [selected]);

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleProjectRefresh(project: CrmProject) {
    setSelected(project);
    setProjects((prev) => prev.map((p) => (p.id === project.id ? project : p)));
  }

  function handleDeleted() {
    if (selected) {
      setProjects((prev) => prev.filter((p) => p.id !== selected.id));
    }
    setSelected(null);
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description,
          clientEmail: form.clientEmail,
          progress: form.progress,
          status: form.status,
          team: [{ name: form.teamName, role: form.teamRole }],
          milestones: [{ title: form.milestone, status: "in_progress" }],
        }),
      });
      const j = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(j.error || "Create failed");
      setCreating(false);
      setForm((f) => ({ ...f, title: "", description: "", clientEmail: "" }));
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          Projects CRM
        </h2>
        <button
          type="button"
          onClick={() => setCreating((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xl bg-[var(--color-accent)] px-3 py-2 text-sm font-semibold text-[#05080f]"
        >
          <Plus className="h-4 w-4" /> Create project
        </button>
      </div>

      {creating ? (
        <form
          onSubmit={(e) => void create(e)}
          className="grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-5 md:grid-cols-2"
        >
          <input
            required
            placeholder="Project title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm md:col-span-2"
          />
          <input
            required
            type="email"
            placeholder="Client email"
            value={form.clientEmail}
            onChange={(e) => setForm({ ...form, clientEmail: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
          <select
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          >
            <option value="planning">Planning</option>
            <option value="in_progress">In progress</option>
            <option value="review">Review</option>
            <option value="completed">Completed</option>
            <option value="on_hold">On hold</option>
          </select>
          <textarea
            placeholder="Description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={3}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm md:col-span-2"
          />
          <input
            placeholder="Team member name"
            value={form.teamName}
            onChange={(e) => setForm({ ...form, teamName: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
          <input
            placeholder="First milestone"
            value={form.milestone}
            onChange={(e) => setForm({ ...form, milestone: e.target.value })}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
          />
          <label className="text-sm text-[var(--color-muted)] md:col-span-2">
            Progress: {form.progress}%
            <input
              type="range"
              min={0}
              max={100}
              value={form.progress}
              onChange={(e) =>
                setForm({ ...form, progress: Number(e.target.value) })
              }
              className="mt-1 w-full"
            />
          </label>
          {error ? (
            <p className="text-xs text-red-400 md:col-span-2">{error}</p>
          ) : null}
          <button
            type="submit"
            disabled={busy}
            className="rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-50 md:col-span-2"
          >
            {busy ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : (
              "Create & email client"
            )}
          </button>
        </form>
      ) : null}

      {!selected ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setSelected(p)}
              className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4 text-left hover:border-[var(--color-accent)]/40"
            >
              <p className="font-semibold text-[var(--color-text)]">{p.title}</p>
              <p className="mt-1 text-xs text-[var(--color-muted)]">
                {p.client_email || "No email"} · {p.progress}%
                {p.status === "on_hold" ? " · Paused" : ""}
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--color-border)]">
                <div
                  className="h-full bg-[var(--color-accent)]"
                  style={{ width: `${p.progress}%` }}
                />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--color-border)] p-2">
          <button
            type="button"
            className="mb-2 text-xs text-[var(--color-accent)]"
            onClick={() => setSelected(null)}
          >
            ← Back to list
          </button>
          <ProjectProgressView
            project={selected}
            mode="admin"
            onRefresh={handleProjectRefresh}
            onDeleted={handleDeleted}
          />
        </div>
      )}
    </div>
  );
}
