"use client";

import { useCallback, useEffect, useState } from "react";
import { UserPlus } from "lucide-react";

type TmsUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  active: boolean;
};

const ROLES = [
  { value: "super_dispatcher", label: "Super Dispatcher" },
  { value: "sub_dispatcher", label: "Sub Dispatcher" },
  { value: "carrier", label: "Carrier" },
  { value: "driver", label: "Driver" },
];

export function TeamManagementClient() {
  const [users, setUsers] = useState<TmsUser[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState("sub_dispatcher");
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

  async function assign(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, full_name: fullName, role }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setMsg(`Assigned ${email} as ${role.replace(/_/g, " ")}`);
      setEmail("");
      setFullName("");
      void refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Team</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Assign super dispatchers, sub dispatchers, carriers, and drivers
        </p>
      </div>

      <form
        onSubmit={(e) => void assign(e)}
        className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:grid-cols-2"
      >
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--color-muted)]">Email (must have signed up once)</span>
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">Full name</span>
          <input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">Role</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-[var(--color-text)]"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? "Assigning…" : "Assign role"}
          </button>
        </div>
      </form>

      {msg ? (
        <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm text-[var(--color-accent-2)]">
          {msg}
        </p>
      ) : null}

      <div className="overflow-x-auto rounded-2xl border border-[var(--color-border)]">
        <table className="w-full min-w-[480px] text-left text-sm">
          <thead className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)]">
            <tr>
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">Role</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  No team members in database yet — env super dispatchers still have access.
                </td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="border-b border-[var(--color-border)]/50">
                  <td className="px-4 py-3 text-[var(--color-text)]">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-3 capitalize text-[var(--color-accent-2)]">
                    {u.role.replace(/_/g, " ")}
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
