"use client";

import { useCallback, useEffect, useState } from "react";
import { Trash2, UserPlus } from "lucide-react";

type TmsUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  active: boolean;
};

export function TeamManagementClient() {
  const [users, setUsers] = useState<TmsUser[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/users");
    if (res.ok) {
      const data = await res.json();
      setUsers(data.users ?? []);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: fullName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg(`Invited ${email} as sub dispatcher.`);
      setEmail("");
      setFullName("");
      void refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function terminate(id: string, emailLabel: string) {
    if (!confirm(`Terminate ${emailLabel}? They will lose dispatcher access immediately.`)) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/users?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg(`Terminated ${emailLabel}.`);
      void refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  const subDispatchers = users.filter((u) => u.role === "sub_dispatcher");

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Team</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Super dispatchers can invite and terminate sub dispatchers only.
        </p>
      </div>

      <form
        onSubmit={(e) => void invite(e)}
        className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:grid-cols-2"
      >
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--color-muted)]">
            Sub dispatcher email (must have signed up once)
          </span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--color-muted)]">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? "Inviting…" : "Invite sub dispatcher"}
          </button>
        </div>
      </form>

      {msg ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {msg}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {subDispatchers.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  No sub dispatchers yet. Invite someone who has already signed up.
                </td>
              </tr>
            ) : (
              subDispatchers.map((u) => (
                <tr key={u.id} className="border-b border-[var(--color-border)]/50">
                  <td className="px-4 py-3 text-[var(--color-text)]">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        u.active
                          ? "text-emerald-400"
                          : "text-[var(--color-muted)] line-through"
                      }
                    >
                      {u.active ? "Active" : "Terminated"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {u.active ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void terminate(u.id, u.email)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Terminate
                      </button>
                    ) : null}
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
