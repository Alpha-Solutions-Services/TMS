"use client";

import { useCallback, useEffect, useState } from "react";
import { Copy, Loader2, FileSignature } from "lucide-react";
import {
  CARRIER_AGREEMENT_PERCENT_MAX,
  CARRIER_AGREEMENT_PERCENT_MIN,
} from "@/lib/freight/carrier-agreement-terms";

type AgreementRow = {
  id: string;
  invited_email: string | null;
  dispatch_percent: number;
  requires_documents: boolean;
  status: string;
  expires_at: string;
  terms_version: string;
  company_name: string | null;
  contact_name: string | null;
  carrier_email: string | null;
  carrier_phone: string | null;
  accepted_at: string | null;
  created_at: string;
  agreementUrl: string;
  signedUrl: string | null;
  pdfUrl: string | null;
};

export function DispatcherAgreementsPanel() {
  const [rows, setRows] = useState<AgreementRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastUrl, setLastUrl] = useState<string | null>(null);

  const [dispatchPercent, setDispatchPercent] = useState("5");
  const [invitedEmail, setInvitedEmail] = useState("");
  const [requiresDocuments, setRequiresDocuments] = useState(true);
  const [sendEmail, setSendEmail] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/dispatcher/agreements");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not load agreements");
      setRows((json.agreements ?? []) as AgreementRow[]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Load failed");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createAgreement(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    setMsg(null);
    setLastUrl(null);
    try {
      const percent = Number.parseFloat(dispatchPercent);
      if (
        !Number.isFinite(percent) ||
        percent < CARRIER_AGREEMENT_PERCENT_MIN ||
        percent > CARRIER_AGREEMENT_PERCENT_MAX
      ) {
        throw new Error(
          `Dispatch % must be between ${CARRIER_AGREEMENT_PERCENT_MIN} and ${CARRIER_AGREEMENT_PERCENT_MAX}`,
        );
      }
      if (sendEmail && !invitedEmail.trim()) {
        throw new Error("Enter an email to send the agreement, or uncheck Send email");
      }

      const res = await fetch("/api/dispatcher/agreements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dispatchPercent: percent,
          invitedEmail: invitedEmail.trim() || undefined,
          requiresDocuments,
          sendEmail: sendEmail && Boolean(invitedEmail.trim()),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not create agreement");

      setMsg(
        sendEmail && invitedEmail.trim()
          ? "Agreement created and emailed to the carrier."
          : "Agreement created. Copy the link and send it to the carrier.",
      );
      setLastUrl(json.agreementUrl as string);
      setInvitedEmail("");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this pending agreement link?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/dispatcher/agreements", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Revoke failed");
      setMsg("Agreement revoked.");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Revoke failed");
    } finally {
      setBusy(false);
    }
  }

  async function copyUrl(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setMsg("Link copied.");
    } catch {
      setErr("Could not copy link");
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={createAgreement}
        className="grid gap-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-5 sm:grid-cols-2"
      >
        <div className="sm:col-span-2 flex items-start gap-3">
          <FileSignature className="mt-0.5 h-5 w-5 text-[var(--color-accent)]" />
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
              New carrier agreement
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              You set the dispatch %. Carrier fills company, name, email, and phone,
              then accepts. After accept we create a 7-day TMS invite and email supers
              the signed PDF.
            </p>
          </div>
        </div>

        <label className="block text-xs text-[var(--color-muted)]">
          Dispatch % ({CARRIER_AGREEMENT_PERCENT_MIN}–{CARRIER_AGREEMENT_PERCENT_MAX})
          <input
            required
            type="number"
            min={CARRIER_AGREEMENT_PERCENT_MIN}
            max={CARRIER_AGREEMENT_PERCENT_MAX}
            step="0.01"
            value={dispatchPercent}
            onChange={(e) => setDispatchPercent(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </label>

        <label className="block text-xs text-[var(--color-muted)]">
          Carrier email (optional)
          <input
            type="email"
            value={invitedEmail}
            onChange={(e) => setInvitedEmail(e.target.value)}
            placeholder="carrier@company.com"
            className="mt-1 w-full rounded-lg border border-[var(--color-border)] bg-[#050912] px-3 py-2 text-sm text-[var(--color-text)]"
          />
        </label>

        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={requiresDocuments}
            onChange={(e) => setRequiresDocuments(e.target.checked)}
          />
          Require documents at registration
        </label>

        <label className="flex items-center gap-2 text-xs text-[var(--color-muted)]">
          <input
            type="checkbox"
            checked={sendEmail}
            onChange={(e) => setSendEmail(e.target.checked)}
          />
          Email agreement link (needs email above)
        </label>

        <div className="sm:col-span-2">
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-sm font-semibold text-[#05080f] disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Create agreement link
          </button>
        </div>
      </form>

      {err ? (
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {err}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100">
          {msg}
        </p>
      ) : null}
      {lastUrl ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[#050912] p-3 text-sm">
          <code className="min-w-0 flex-1 break-all text-[var(--color-accent)]">
            {lastUrl}
          </code>
          <button
            type="button"
            onClick={() => void copyUrl(lastUrl)}
            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            <Copy className="h-3.5 w-3.5" /> Copy
          </button>
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
          Recent agreements
        </h2>
        {loading ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-4 text-sm text-[var(--color-muted)]">No agreements yet.</p>
        ) : (
          <div className="mt-4 overflow-x-auto rounded-2xl border border-[var(--color-border)]">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--color-surface)]/60 text-xs uppercase tracking-wider text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2">%</th>
                  <th className="px-3 py-2">Carrier</th>
                  <th className="px-3 py-2">Created</th>
                  <th className="px-3 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.id}
                    className="border-t border-[var(--color-border)] text-[var(--color-text)]"
                  >
                    <td className="px-3 py-2 capitalize">{row.status}</td>
                    <td className="px-3 py-2">{row.dispatch_percent}%</td>
                    <td className="px-3 py-2">
                      {row.company_name || row.invited_email || "—"}
                      {row.carrier_email ? (
                        <span className="block text-xs text-[var(--color-muted)]">
                          {row.contact_name} · {row.carrier_email}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                      {new Date(row.created_at).toLocaleString()}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-2">
                        {row.status === "pending" ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void copyUrl(row.agreementUrl)}
                              className="text-xs text-[var(--color-accent)] hover:underline"
                            >
                              Copy link
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void revoke(row.id)}
                              className="text-xs text-red-300 hover:underline disabled:opacity-50"
                            >
                              Revoke
                            </button>
                          </>
                        ) : null}
                        {row.status === "accepted" && row.signedUrl ? (
                          <>
                            <a
                              href={row.signedUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-semibold text-emerald-300 hover:underline"
                            >
                              View signed
                            </a>
                            <button
                              type="button"
                              onClick={() => void copyUrl(row.signedUrl!)}
                              className="text-xs text-[var(--color-accent)] hover:underline"
                            >
                              Copy signed link
                            </button>
                            {row.pdfUrl ? (
                              <a
                                href={row.pdfUrl}
                                className="text-xs text-[var(--color-muted)] hover:text-[var(--color-text)] hover:underline"
                              >
                                Download PDF
                              </a>
                            ) : null}
                          </>
                        ) : null}
                        {row.status !== "pending" && row.status !== "accepted" ? (
                          <span className="text-xs text-[var(--color-muted)]">—</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
