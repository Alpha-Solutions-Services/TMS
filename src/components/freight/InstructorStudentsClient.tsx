"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import type { AcademyStudentRow } from "@/lib/freight/academy-db";

export function InstructorStudentsClient() {
  const [students, setStudents] = useState<AcademyStudentRow[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [notes, setNotes] = useState<{ id: string; body: string; created_at: string }[]>([]);
  const [modules, setModules] = useState<{ id: string; title: string; sort_order: number }[]>([]);
  const [progress, setProgress] = useState<Record<string, string>>({});
  const [noteBody, setNoteBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const loadStudents = useCallback(async () => {
    const res = await fetch("/api/freight/dispatcher/students?status=paid");
    const body = (await res.json()) as { students?: AcademyStudentRow[]; error?: string };
    if (!res.ok) {
      setError(body.error ?? "Could not load students");
      return;
    }
    setStudents(body.students ?? []);
  }, []);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  async function openStudent(id: string) {
    setSelected(id);
    setError(null);
    setBusy(true);
    try {
      const res = await fetch(`/api/freight/instructor/student/${id}`);
      const body = (await res.json()) as {
        error?: string;
        notes?: { id: string; body: string; created_at: string }[];
        modules?: { id: string; title: string; sort_order: number }[];
        progress?: { module_id: string; status: string }[];
      };
      if (!res.ok) throw new Error(body.error ?? "Load failed");
      setNotes(body.notes ?? []);
      setModules(body.modules ?? []);
      const map: Record<string, string> = {};
      for (const p of body.progress ?? []) map[p.module_id] = p.status;
      setProgress(map);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveNote() {
    if (!selected || !noteBody.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/freight/instructor/student/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "note", body: noteBody }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setNoteBody("");
      await openStudent(selected);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function setModuleStatus(moduleId: string, status: string) {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/freight/instructor/student/${selected}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "progress", moduleId, status }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setProgress((prev) => ({ ...prev, [moduleId]: status }));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const active = students.find((s) => s.id === selected);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Paid students</h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Coordinate modules and notes for active academy students.
        </p>
        <ul className="mt-4 space-y-1">
          {students.length === 0 ? (
            <li className="text-xs text-[var(--color-muted)]">No paid students yet.</li>
          ) : (
            students.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => void openStudent(s.id)}
                  className={clsx(
                    "w-full rounded-xl px-3 py-2 text-left text-sm transition",
                    selected === s.id
                      ? "bg-[var(--color-accent-dim)] text-[var(--color-accent)]"
                      : "text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]",
                  )}
                >
                  <span className="block font-medium">{s.fullName || s.email}</span>
                  <span className="block text-[10px] opacity-80">{s.email}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>

      <div className="space-y-4">
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
        {!selected ? (
          <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-10 text-center text-sm text-[var(--color-muted)]">
            Select a student to view progress and leave coordination notes.
          </div>
        ) : (
          <>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
              <h3
                className="text-lg font-bold text-[var(--color-text)]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                {active?.fullName || "Student"}
              </h3>
              <p className="text-sm text-[var(--color-muted)]">{active?.email}</p>
              <p className="mt-1 text-xs capitalize text-[var(--color-muted)]">
                Plan: {active?.enrollmentPlan || "—"}
              </p>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Module progress</h4>
              <ul className="mt-3 space-y-2">
                {modules.map((m) => (
                  <li
                    key={m.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2"
                  >
                    <span className="text-sm text-[var(--color-text)]">
                      {m.sort_order}. {m.title}
                    </span>
                    <select
                      disabled={busy}
                      value={progress[m.id] ?? "not_started"}
                      onChange={(e) => void setModuleStatus(m.id, e.target.value)}
                      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                    >
                      <option value="not_started">Not started</option>
                      <option value="in_progress">In progress</option>
                      <option value="completed">Completed</option>
                    </select>
                  </li>
                ))}
              </ul>
            </div>

            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Coordination notes</h4>
              <textarea
                value={noteBody}
                onChange={(e) => setNoteBody(e.target.value)}
                rows={3}
                placeholder="Leave a note for this student…"
                className="mt-3 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={busy || !noteBody.trim()}
                onClick={() => void saveNote()}
                className="mt-2 rounded-xl bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
              >
                Add note
              </button>
              <ul className="mt-4 space-y-2">
                {notes.map((n) => (
                  <li
                    key={n.id}
                    className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-muted)]"
                  >
                    <p className="text-[var(--color-text)]">{n.body}</p>
                    <p className="mt-1 text-[10px]">{new Date(n.created_at).toLocaleString()}</p>
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
        <Link href="/freight/instructor/dashboard" className="text-xs text-[var(--color-accent)]">
          ← Dashboard
        </Link>
      </div>
    </div>
  );
}
