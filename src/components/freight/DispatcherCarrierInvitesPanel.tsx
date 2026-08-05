"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

type PendingInvite = {
  id: string;
  invited_email: string;
  invitee_name: string | null;
  requires_documents: boolean;
  invite_url?: string;
  inviteUrl?: string;
  expires_at: string;
  created_at: string;
};

export function DispatcherCarrierInvitesPanel() {
  const [invitedEmail, setInvitedEmail] = useState("");
  const [inviteeName, setInviteeName] = useState("");
  const [requiresDocuments, setRequiresDocuments] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingInvite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/freight/dispatcher/carrier-invitations");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load invites");
      setPending((json.invitations ?? []) as PendingInvite[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    setLastInviteUrl(null);
    try {
      const res = await fetch("/api/freight/dispatcher/carrier-invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          invitedEmail,
          inviteeName: inviteeName || undefined,
          requiresDocuments,
          sendEmail: true,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create invite");
      setMsg("Invitation created and email sent.");
      setLastInviteUrl(json.inviteUrl as string);
      setInvitedEmail("");
      setInviteeName("");
      setRequiresDocuments(true);
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Carrier invitations
        </h2>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          Super only — invite a carrier by email. Uncheck &quot;Require documents&quot; to
          skip uploads at registration (manual verify still required).
        </p>
      </div>

      <form
        onSubmit={createInvite}
        className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:grid-cols-2"
      >
        <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">
          Invitee email
          <input
            required
            type="email"
            value={invitedEmail}
            onChange={(e) => setInvitedEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)]">
          Name (optional)
          <input
            value={inviteeName}
            onChange={(e) => setInviteeName(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm"
          />
        </label>
        <label className="flex items-center gap-2 self-end text-xs text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={requiresDocuments}
            onChange={(e) => setRequiresDocuments(e.target.checked)}
          />
          Require documents at registration
        </label>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-sm font-bold text-[#05080f] sm:col-span-2"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Create invite
        </button>
      </form>

      {err ? <p className="text-xs text-red-200">{err}</p> : null}
      {msg ? <p className="text-xs text-emerald-200">{msg}</p> : null}
      {lastInviteUrl ? (
        <p className="break-all rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)]/50 px-3 py-2 text-xs text-[var(--color-muted)]">
          Link:{" "}
          <a
            href={lastInviteUrl}
            className="font-semibold text-[var(--color-accent)] underline"
          >
            {lastInviteUrl}
          </a>
        </p>
      ) : null}

      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--color-muted)]">
          Pending invites
        </h3>
        {loading ? (
          <p className="mt-3 text-xs text-[var(--color-muted)]">Loading…</p>
        ) : pending.length === 0 ? (
          <p className="mt-3 text-xs text-[var(--color-muted)]">No pending invites.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {pending.map((inv) => {
              const url = inv.inviteUrl ?? inv.invite_url ?? "";
              return (
                <li
                  key={inv.id}
                  className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-medium text-[var(--color-text)]">
                      {inv.invited_email}
                      {inv.invitee_name ? ` · ${inv.invitee_name}` : ""}
                    </span>
                    <span className="text-[var(--color-muted)]">
                      {inv.requires_documents ? "docs required" : "no docs"}
                    </span>
                  </div>
                  <p className="mt-1 text-[var(--color-muted)]">
                    Expires {new Date(inv.expires_at).toLocaleString()}
                  </p>
                  {url ? (
                    <a
                      href={url}
                      className="mt-1 inline-block text-[var(--color-accent)] underline"
                    >
                      Copy/open link
                    </a>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
