"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function DispatcherAcceptInviteClient({ token }: { token: string }) {
  const router = useRouter();
  const [valid, setValid] = useState<null | boolean>(null);
  const [invite, setInvite] = useState<{
    inviteeEmail: string;
    inviteeName: string;
    roleLabel: string;
    inviterName: string;
    expiresAt: string;
  } | null>(null);
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token) {
      setValid(false);
      return;
    }
    void (async () => {
      const res = await fetch(
        `/api/freight/validate-dispatcher-invite?token=${encodeURIComponent(token)}`,
      );
      const data = (await res.json()) as {
        valid?: boolean;
        inviteeEmail?: string;
        inviteeName?: string;
        roleLabel?: string;
        inviterName?: string;
        expiresAt?: string;
      };
      if (!data.valid) {
        setValid(false);
      } else {
        setValid(true);
        setInvite({
          inviteeEmail: data.inviteeEmail ?? "",
          inviteeName: data.inviteeName ?? "",
          roleLabel: data.roleLabel ?? "Dispatcher",
          inviterName: data.inviterName ?? "Super Dispatcher",
          expiresAt: data.expiresAt ?? "",
        });
        setFullName(data.inviteeName ?? "");
      }
    })();
  }, [token]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm || password.length < 8) {
      setErr("Passwords must match and be at least 8 characters.");
      return;
    }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/freight/accept-dispatcher-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, fullName, password }),
      });
      const data = (await res.json()) as { error?: string; email?: string };
      if (!res.ok) throw new Error(data.error || "Setup failed");

      const sb = createClient();
      if (data.email && sb) {
        await sb.auth.signInWithPassword({ email: data.email, password });
      }
      router.replace("/dispatcher/dashboard");
      router.refresh();
    } catch (ex: unknown) {
      setErr(ex instanceof Error ? ex.message : "Error");
    } finally {
      setBusy(false);
    }
  }

  if (valid === false) {
    return (
      <div className="rounded-3xl border border-red-400/35 bg-[#2a0710]/40 px-8 py-10 text-center">
        <p className="font-semibold text-[var(--color-text)]">Invalid or expired invite</p>
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Dispatcher invite links expire after 7 days. Ask your super dispatcher to send a new invite.
        </p>
        <Link href="/login" className="mt-6 inline-flex text-[var(--color-accent)] underline">
          Go to TMS login
        </Link>
      </div>
    );
  }

  if (valid !== true || !invite) {
    return <p className="text-center text-sm text-[var(--color-muted)]">Validating invitation…</p>;
  }

  return (
    <div className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 px-8 py-10">
      <h1
        className="text-2xl font-bold text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Join Alpha Freight TMS
      </h1>
      <p className="mt-3 text-sm text-[var(--color-muted)]">
        {invite.inviterName} invited you as{" "}
        <strong className="text-[var(--color-text)]">{invite.roleLabel}</strong>.
      </p>
      {invite.expiresAt ? (
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Link expires {new Date(invite.expiresAt).toLocaleString()}
        </p>
      ) : null}
      <form onSubmit={submit} className="mt-10 max-w-lg space-y-4">
        {err ? <p className="text-sm text-red-200">{err}</p> : null}
        <label className="text-xs text-[var(--color-muted)]">Full name</label>
        <input
          required
          className="dispatch-field w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
        />
        <label className="text-xs text-[var(--color-muted)]">Email</label>
        <input
          readOnly
          value={invite.inviteeEmail}
          className="w-full cursor-not-allowed rounded-lg border border-[var(--color-border)] bg-[#0b1120] px-3 py-2 opacity-70"
        />
        <label className="text-xs text-[var(--color-muted)]">Password</label>
        <input
          required
          type="password"
          minLength={8}
          className="dispatch-field w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <label className="text-xs text-[var(--color-muted)]">Confirm password</label>
        <input
          required
          type="password"
          minLength={8}
          className="dispatch-field w-full rounded-lg border border-[var(--color-border)] px-3 py-2"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-[var(--color-accent)] py-3 text-sm font-bold text-[#05080f] disabled:opacity-40"
        >
          {busy ? "Setting up…" : "Create account & open dashboard"}
        </button>
      </form>
    </div>
  );
}
