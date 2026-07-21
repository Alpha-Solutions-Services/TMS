"use client";

import { useCallback, useEffect, useState } from "react";
import { Link2, Trash2, UserPlus } from "lucide-react";

type TmsUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string;
  active: boolean;
};

type AssignCarrier = {
  id: string;
  company_name: string | null;
  full_name: string | null;
  assigned_dispatcher_id: string | null;
};

type AssignDriver = {
  id: string;
  driver_name: string;
  carrier_company_name: string;
  assigned_dispatcher_id: string | null;
};

type InviteRole = "dispatcher" | "sub_dispatcher";

const ROLE_OPTIONS: { value: InviteRole; label: string }[] = [
  { value: "dispatcher", label: "Dispatcher" },
  { value: "sub_dispatcher", label: "Sub Dispatcher" },
];

function roleLabel(role: string) {
  if (role === "dispatcher") return "Dispatcher";
  if (role === "sub_dispatcher") return "Sub Dispatcher";
  return role;
}

function displayName(u: TmsUser) {
  return u.full_name?.trim() || u.email.split("@")[0];
}

export function TeamManagementClient() {
  const [users, setUsers] = useState<TmsUser[]>([]);
  const [assignCarriers, setAssignCarriers] = useState<AssignCarrier[]>([]);
  const [assignDrivers, setAssignDrivers] = useState<AssignDriver[]>([]);
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [inviteRole, setInviteRole] = useState<InviteRole>("sub_dispatcher");
  const [assignDispatcherId, setAssignDispatcherId] = useState("");
  const [assignType, setAssignType] = useState<"carrier" | "driver">("carrier");
  const [assignEntityId, setAssignEntityId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [usersRes, assignRes] = await Promise.all([
      fetch("/api/users"),
      fetch("/api/users/assign"),
    ]);
    if (usersRes.ok) {
      const data = await usersRes.json();
      setUsers(data.users ?? []);
    }
    if (assignRes.ok) {
      const data = await assignRes.json();
      setAssignCarriers(data.carriers ?? []);
      setAssignDrivers(data.drivers ?? []);
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
        body: JSON.stringify({ email, full_name: fullName, role: inviteRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      const emailNote = data.emailSent
        ? " Invite email sent (7-day link)."
        : ` Warning: email not sent${data.emailError ? ` (${data.emailError})` : ""}. Check SMTP on Vercel.`;
      setMsg(`Invited ${email} as ${roleLabel(inviteRole)}.${emailNote}`);
      setEmail("");
      setFullName("");
      void refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function assignMember(e: React.FormEvent) {
    e.preventDefault();
    if (!assignDispatcherId || !assignEntityId) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatcherUserId: assignDispatcherId,
          assigneeType: assignType,
          assigneeId: assignEntityId,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Assign failed");
      const emailNote = data.emailSent
        ? " Assignment email sent to dispatcher."
        : ` Email not sent${data.emailError ? `: ${data.emailError}` : ""}.`;
      setMsg(`Assigned team member.${emailNote}`);
      setAssignEntityId("");
      void refresh();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(id: string, newRole: InviteRole) {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, role: newRole }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Role change failed");
      setMsg(`Updated role to ${roleLabel(newRole)}.`);
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

  const teamMembers = users.filter(
    (u) => u.active && (u.role === "dispatcher" || u.role === "sub_dispatcher"),
  );

  return (
    <div className="space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Team</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Invite dispatchers, assign them to carriers/drivers, and control contact privacy (names only for non-super).
        </p>
      </div>

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4 text-xs text-[var(--color-muted)]">
        <p className="font-semibold text-[var(--color-text)]">Privacy</p>
        <p className="mt-1">
          Dispatchers and sub dispatchers see <strong>carrier/driver names only</strong> — not email or phone.
          Super dispatchers see full contact details.
        </p>
      </div>

      <form
        onSubmit={(e) => void invite(e)}
        className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:grid-cols-2"
      >
        <h2 className="text-sm font-semibold text-[var(--color-accent)] md:col-span-2">Invite team member</h2>
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--color-muted)]">Email</span>
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
        <fieldset className="md:col-span-2">
          <legend className="text-sm text-[var(--color-muted)]">Role</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {ROLE_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`cursor-pointer rounded-xl border p-3 ${
                  inviteRole === opt.value
                    ? "border-[var(--color-accent)] bg-[var(--color-accent-dim)]"
                    : "border-[var(--color-border)]"
                }`}
              >
                <input
                  type="radio"
                  name="inviteRole"
                  value={opt.value}
                  checked={inviteRole === opt.value}
                  onChange={() => setInviteRole(opt.value)}
                  className="sr-only"
                />
                <span className="text-sm font-semibold text-[var(--color-text)]">{opt.label}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            <UserPlus className="h-4 w-4" />
            {busy ? "Inviting…" : `Invite ${roleLabel(inviteRole)}`}
          </button>
        </div>
      </form>

      <form
        onSubmit={(e) => void assignMember(e)}
        className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 md:grid-cols-2"
      >
        <h2 className="flex items-center gap-2 text-sm font-semibold text-[var(--color-accent)] md:col-span-2">
          <Link2 className="h-4 w-4" />
          Assign to carrier or driver
        </h2>
        <label className="block text-sm md:col-span-2">
          <span className="text-[var(--color-muted)]">Team member</span>
          <select
            required
            value={assignDispatcherId}
            onChange={(e) => setAssignDispatcherId(e.target.value)}
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value="">Select dispatcher…</option>
            {teamMembers.map((u) => (
              <option key={u.id} value={u.id}>
                {displayName(u)} — {roleLabel(u.role)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">Assign to</span>
          <select
            value={assignType}
            onChange={(e) => {
              setAssignType(e.target.value as "carrier" | "driver");
              setAssignEntityId("");
            }}
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value="carrier">Carrier (portal)</option>
            <option value="driver">Driver (roster)</option>
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-[var(--color-muted)]">
            {assignType === "carrier" ? "Carrier" : "Driver"}
          </span>
          <select
            required
            value={assignEntityId}
            onChange={(e) => setAssignEntityId(e.target.value)}
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
          >
            <option value="">Select…</option>
            {assignType === "carrier"
              ? assignCarriers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.company_name || c.full_name || c.id}
                    {c.assigned_dispatcher_id ? " (assigned)" : ""}
                  </option>
                ))
              : assignDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.driver_name} · {d.carrier_company_name}
                    {d.assigned_dispatcher_id ? " (assigned)" : ""}
                  </option>
                ))}
          </select>
        </label>
        <div className="md:col-span-2">
          <button
            type="submit"
            disabled={busy || !assignDispatcherId || !assignEntityId}
            className="rounded-xl bg-[var(--color-accent)] px-5 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            {busy ? "Assigning…" : "Assign & email dispatcher"}
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
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody>
            {teamMembers.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-[var(--color-muted)]">
                  No team members yet.
                </td>
              </tr>
            ) : (
              teamMembers.map((u) => (
                <tr key={u.id} className="border-b border-[var(--color-border)]/50">
                  <td className="px-4 py-3 text-[var(--color-text)]">{u.email}</td>
                  <td className="px-4 py-3 text-[var(--color-muted)]">{u.full_name ?? "—"}</td>
                  <td className="px-4 py-3">
                    <select
                      value={u.role}
                      disabled={busy}
                      onChange={(e) => void changeRole(u.id, e.target.value as InviteRole)}
                      className="dispatch-field rounded-lg border border-[var(--color-border)] bg-transparent px-2 py-1 text-xs text-[var(--color-accent)]"
                    >
                      <option value="dispatcher">Dispatcher</option>
                      <option value="sub_dispatcher">Sub Dispatcher</option>
                    </select>
                  </td>
                  <td className="px-4 py-3 text-emerald-400">Active</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void terminate(u.id, u.email)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-500/40 px-3 py-1.5 text-xs text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Terminate
                    </button>
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
