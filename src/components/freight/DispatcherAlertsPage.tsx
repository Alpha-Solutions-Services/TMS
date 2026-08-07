"use client";

import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Loader2, Megaphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useDispatchDashboard } from "@/components/freight/useDispatchDashboard";

type Announcement = {
  id: string;
  title: string;
  body: string;
  audience: string;
  starts_at: string;
  ends_at: string | null;
};

export function DispatcherAlertsPage() {
  const { data, loading, error } = useDispatchDashboard();
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<"carrier" | "all">("carrier");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const loadAnnouncements = useCallback(async () => {
    try {
      const res = await fetch("/api/dispatcher/announcements", {
        cache: "no-store",
      });
      const json = await res.json();
      if (res.ok) setAnnouncements((json.announcements ?? []) as Announcement[]);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    void loadAnnouncements();
  }, [loadAnnouncements]);

  async function createAnnouncement() {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch("/api/dispatcher/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, audience }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed");
      setTitle("");
      setBody("");
      setMsg("Announcement published.");
      await loadAnnouncements();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeAnnouncement(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/dispatcher/announcements", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error ?? "Failed");
      }
      await loadAnnouncements();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading && !data) return <p className="p-8 text-[var(--color-muted)]">Loading alerts…</p>;
  if (error && !data) return <p className="p-8 text-red-300">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <div>
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Alerts
        </h1>
        <p className="mt-1 text-sm text-[var(--color-muted)]">
          Sheet-derived alerts plus carrier announcements
        </p>
      </div>

      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5">
        <div className="flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-[var(--color-accent)]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Broadcast announcement
          </h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">
            Title
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              maxLength={160}
            />
          </label>
          <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">
            Body
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
              maxLength={4000}
            />
          </label>
          <label className="block text-xs text-[var(--color-muted)]">
            Audience
            <select
              value={audience}
              onChange={(e) => setAudience(e.target.value as "carrier" | "all")}
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
            >
              <option value="carrier">Carriers</option>
              <option value="all">Everyone</option>
            </select>
          </label>
          <div className="flex items-end">
            <button
              type="button"
              disabled={busy || title.trim().length < 2 || body.trim().length < 2}
              onClick={() => void createAnnouncement()}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-semibold text-[#05080f] disabled:opacity-40"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Publish
            </button>
          </div>
        </div>
        {msg ? <p className="mt-3 text-xs text-emerald-300">{msg}</p> : null}
        {err ? <p className="mt-3 text-xs text-red-300">{err}</p> : null}

        {announcements.length > 0 ? (
          <ul className="mt-5 space-y-2">
            {announcements.map((a) => (
              <li
                key={a.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-[var(--color-border)] px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)]">{a.title}</p>
                  <p className="mt-1 text-xs text-[var(--color-muted)] line-clamp-2">{a.body}</p>
                  <p className="mt-1 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
                    {a.audience}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Remove"
                  onClick={() => void removeAnnouncement(a.id)}
                  className="text-[var(--color-muted)] hover:text-red-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <ul className="space-y-3">
        {data.alerts.map((alert) => (
          <li
            key={`${alert.type}-${alert.message}`}
            className={clsx(
              "flex items-start gap-4 rounded-2xl border px-5 py-4",
              alert.severity === "high"
                ? "border-red-500/30 bg-red-500/10"
                : alert.severity === "medium"
                  ? "border-orange-500/30 bg-orange-500/10"
                  : "border-[var(--color-border)] bg-[var(--color-surface)]/40",
            )}
          >
            {alert.severity === "low" ? (
              <CheckCircle2 className="mt-0.5 h-5 w-5 text-emerald-400" />
            ) : (
              <AlertTriangle
                className={clsx(
                  "mt-0.5 h-5 w-5",
                  alert.severity === "high" ? "text-red-400" : "text-orange-300",
                )}
              />
            )}
            <div>
              <p className="text-xs uppercase tracking-wider text-[var(--color-muted)]">
                {alert.type.replace(/_/g, " ")}
              </p>
              <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{alert.message}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
