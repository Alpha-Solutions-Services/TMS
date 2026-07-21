"use client";

import { useEffect, useState } from "react";

type CarrierOption = { id: string; company_name: string | null; full_name: string | null };

export function InviteDriverModal({
  mode,
  carriers,
}: {
  mode: "carrier" | "dispatcher";
  carriers?: CarrierOption[];
}) {
  const [open, setOpen] = useState(false);
  const [driverName, setDriverName] = useState("");
  const [driverEmail, setDriverEmail] = useState("");
  const [carrierId, setCarrierId] = useState(carriers?.[0]?.id ?? "");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (carriers?.[0]?.id) setCarrierId((prev) => prev || carriers![0].id);
  }, [carriers]);

  if (mode === "dispatcher" && (!carriers || carriers.length === 0)) {
    return (
      <p className="rounded-lg border border-amber-500/35 bg-[#291c05]/70 px-4 py-3 text-[11px] text-[var(--color-muted)]">
        No verified carriers yet — finalize onboarding before inviting drivers from dispatch.
      </p>
    );
  }

  async function send() {
    setBusy(true);
    setMsg(null);
    if (mode === "dispatcher" && !carrierId) {
      setMsg("Select carrier.");
      setBusy(false);
      return;
    }
    try {
      const payload =
        mode === "dispatcher"
          ? { driverName, driverEmail, carrierId }
          : { driverName, driverEmail };
      const res = await fetch("/api/freight/invite-driver", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed");
      setMsg(`Invitation sent to ${driverEmail}. They have 7 days to accept.`);
      setDriverName("");
      setDriverEmail("");
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : "Error sending invite");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[#05080f]"
      >
        Invite driver
      </button>

      {open ? (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/70 px-4">
          <div className="relative w-full max-w-md rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-8">
            <button
              aria-label="Close"
              type="button"
              onClick={() => setOpen(false)}
              className="absolute right-5 top-4 text-xl text-[var(--color-muted)]"
            >
              ×
            </button>
            <h3 className="text-lg font-bold text-[var(--color-text)]">Driver invitation</h3>
            {mode === "dispatcher" ? (
              <>
                <label className="mt-6 block text-xs text-[var(--color-muted)]">
                  Assign to verified carrier
                </label>
                <select
                  className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
                  value={carrierId}
                  onChange={(e) => setCarrierId(e.target.value)}
                >
                  {carriers!.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.company_name || c.full_name || c.id}
                    </option>
                  ))}
                </select>
              </>
            ) : null}
            <label className="mt-6 block text-xs text-[var(--color-muted)]">Driver name</label>
            <input
              required
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2"
              value={driverName}
              onChange={(e) => setDriverName(e.target.value)}
            />
            <label className="mt-4 block text-xs text-[var(--color-muted)]">Driver email</label>
            <input
              required
              type="email"
              className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2"
              value={driverEmail}
              onChange={(e) => setDriverEmail(e.target.value)}
            />
            <button
              disabled={busy}
              type="button"
              onClick={() => void send()}
              className="mt-8 w-full rounded-lg bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f] disabled:opacity-50"
            >
              {busy ? "Sending…" : "Send invitation"}
            </button>
            {msg ? <p className="mt-4 text-xs text-[var(--color-muted)]">{msg}</p> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
