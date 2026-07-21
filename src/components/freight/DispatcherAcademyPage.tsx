"use client";

import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { GraduationCap, Loader2, RefreshCw } from "lucide-react";
import type { AcademyStudentRow } from "@/lib/freight/academy-db";

function formatWhen(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function statusClass(status: string) {
  if (status === "paid") return "bg-emerald-500/15 text-emerald-300";
  if (status === "pending") return "bg-amber-500/15 text-amber-300";
  if (status === "refunded") return "bg-white/10 text-[var(--color-muted)]";
  return "bg-red-500/15 text-red-300";
}

export function DispatcherAcademyPage() {
  const [students, setStudents] = useState<AcademyStudentRow[]>([]);
  const [filter, setFilter] = useState<"all" | "pending" | "paid" | "unpaid">("pending");
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = filter === "all" ? "" : `?status=${encodeURIComponent(filter)}`;
      const res = await fetch(`/api/freight/dispatcher/students${qs}`);
      const body = (await res.json()) as { error?: string; students?: AcademyStudentRow[] };
      if (!res.ok) throw new Error(body.error ?? "Could not load students");
      setStudents(body.students ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setStatus(
    student: AcademyStudentRow,
    status: "pending" | "paid" | "unpaid" | "refunded",
  ) {
    setBusyId(student.id);
    setError(null);
    try {
      const res = await fetch("/api/freight/dispatcher/students", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentId: student.id,
          status,
          notes: notes[student.id] || undefined,
        }),
      });
      const body = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(body.error ?? "Update failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setBusyId(null);
    }
  }

  const pendingCount = students.filter((s) => s.enrollmentStatus === "pending").length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1
            className="flex items-center gap-2 text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <GraduationCap className="h-7 w-7 text-[var(--color-accent)]" />
            Academy enrollments
          </h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            When a student pays via Zelle / Wise / Payoneer, mark payment accepted here to unlock their dashboard.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] px-3 py-2 text-xs text-[var(--color-text)] disabled:opacity-40"
        >
          <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["pending", "paid", "unpaid", "all"] as const).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={clsx(
              "rounded-xl border px-3 py-1.5 text-xs font-medium capitalize transition",
              filter === key
                ? "border-[var(--color-accent)] bg-[var(--color-accent)]/15 text-[var(--color-accent)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] hover:text-[var(--color-text)]",
            )}
          >
            {key}
            {key === "pending" && filter === "pending" ? ` (${pendingCount})` : ""}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm text-red-300">{error}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[var(--color-surface)]/80 text-xs uppercase text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3">Student</th>
              <th className="px-4 py-3">Plan</th>
              <th className="px-4 py-3">Enrolled</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Notes / actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {loading && students.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : students.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[var(--color-muted)]">
                  No students in this filter. Pending means they submitted enrollment and are waiting for payment confirmation.
                </td>
              </tr>
            ) : (
              students.map((student) => (
                <tr key={student.id} className="hover:bg-[var(--color-accent-dim)]/20">
                  <td className="px-4 py-3">
                    <p className="font-medium text-[var(--color-text)]">
                      {student.fullName || "—"}
                    </p>
                    <p className="text-xs text-[var(--color-muted)]">{student.email}</p>
                  </td>
                  <td className="px-4 py-3 capitalize text-[var(--color-muted)]">
                    {student.enrollmentPlan || "—"}
                  </td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">
                    {formatWhen(student.enrolledAt)}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-xs capitalize",
                        statusClass(student.enrollmentStatus),
                      )}
                    >
                      {student.enrollmentStatus}
                    </span>
                    {student.paymentConfirmedAt ? (
                      <p className="mt-1 text-[10px] text-[var(--color-muted)]">
                        Confirmed {formatWhen(student.paymentConfirmedAt)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3">
                    <input
                      type="text"
                      placeholder="Payment note (optional)"
                      value={notes[student.id] ?? student.paymentNotes ?? ""}
                      onChange={(e) =>
                        setNotes((prev) => ({ ...prev, [student.id]: e.target.value }))
                      }
                      className="mb-2 w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-1 text-xs"
                    />
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        disabled={busyId === student.id || student.enrollmentStatus === "paid"}
                        onClick={() => void setStatus(student, "paid")}
                        className="rounded-lg border border-emerald-500/40 px-2 py-1 text-xs text-emerald-300 disabled:opacity-40"
                      >
                        Accept payment
                      </button>
                      <button
                        type="button"
                        disabled={busyId === student.id}
                        onClick={() => void setStatus(student, "pending")}
                        className="rounded-lg border border-amber-500/40 px-2 py-1 text-xs text-amber-300 disabled:opacity-40"
                      >
                        Pending
                      </button>
                      <button
                        type="button"
                        disabled={busyId === student.id}
                        onClick={() => void setStatus(student, "unpaid")}
                        className="rounded-lg border border-red-500/40 px-2 py-1 text-xs text-red-300 disabled:opacity-40"
                      >
                        Unpaid
                      </button>
                      <button
                        type="button"
                        disabled={busyId === student.id}
                        onClick={() => void setStatus(student, "refunded")}
                        className="rounded-lg border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] disabled:opacity-40"
                      >
                        Refunded
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
