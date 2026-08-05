"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  CARRIER_AGREEMENT_TERMS_VERSION,
  buildCarrierAgreementOnlySections,
  clampAgreementPercent,
} from "@/lib/freight/carrier-agreement-terms";

type Props = {
  token: string;
};

/**
 * Live carrier e-sign. Dispatcher-set % is shown fixed (no range hint).
 * Carrier fills company, name, email, phone only.
 */
export function CarrierAgreementSignClient({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dispatchPercent, setDispatchPercent] = useState(5);
  const [invitedEmail, setInvitedEmail] = useState("");

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ inviteUrl: string; percent: number } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadFailed(null);
      setError(null);
      try {
        const res = await fetch(
          `/api/freight/carrier/agreement/${encodeURIComponent(token)}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Invalid agreement link");
        if (cancelled) return;
        setDispatchPercent(clampAgreementPercent(Number(json.dispatchPercent)));
        if (json.invitedEmail) {
          setInvitedEmail(json.invitedEmail as string);
          setEmail(json.invitedEmail as string);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadFailed(e instanceof Error ? e.message : "Could not load agreement");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sections = useMemo(
    () =>
      buildCarrierAgreementOnlySections({
        companyName,
        contactName,
        email,
        phone,
        dispatchPercent,
      }),
    [companyName, contactName, email, phone, dispatchPercent],
  );

  const canSubmit =
    agreed &&
    companyName.trim().length > 1 &&
    contactName.trim().length > 1 &&
    email.includes("@") &&
    phone.trim().length >= 7 &&
    !busy;

  async function accept() {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/freight/carrier/agreement/${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyName,
            contactName,
            email,
            phone,
            agreed: true,
          }),
        },
      );
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Could not accept");
      setDone({
        inviteUrl: json.inviteUrl as string,
        percent: Number(json.dispatchPercent) || dispatchPercent,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Accept failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-sm text-[var(--color-muted)]">
        Loading agreement…
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1
          className="text-2xl font-bold text-[var(--color-text)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Agreement accepted
        </h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Thank you. Your default dispatch fee is{" "}
          <strong className="text-[var(--color-text)]">{done.percent}%</strong>. A
          TMS registration invite was emailed to you (7-day trial of the software).
        </p>
        <a
          href={done.inviteUrl}
          className="mt-6 inline-flex rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#05080f]"
        >
          Continue to registration
        </a>
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          Agreement unavailable
        </h1>
        <p className="mt-2 text-sm text-red-200">{loadFailed}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1
        className="text-2xl font-bold text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Carrier Dispatch Services Agreement
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Complete your details, review the agreement, then accept.{" "}
        <Link
          href="/carrier/terms"
          className="font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline"
        >
          Terms of Service
        </Link>
        {invitedEmail ? (
          <span className="block mt-1 text-xs">
            Link prepared for {invitedEmail}
          </span>
        ) : null}
      </p>

      {error ? (
        <p className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-200">
          {error}
        </p>
      ) : null}

      <div className="mt-6 grid gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 sm:grid-cols-2">
        <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">
          Company name
          <input
            required
            autoComplete="organization"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Your company LLC"
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)]">
          Your name
          <input
            required
            autoComplete="name"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Full name"
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)]">
          Phone number
          <input
            required
            type="tel"
            autoComplete="tel"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 555-5555"
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">
          Email
          <input
            required
            type="email"
            autoComplete="email"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
          />
        </label>
      </div>

      <div className="mt-8 space-y-6 rounded-2xl border border-[var(--color-border)] bg-[#0a1018] p-5 sm:p-8">
        <p className="text-xs text-[var(--color-muted)]">
          Version <code>{CARRIER_AGREEMENT_TERMS_VERSION}</code>
        </p>
        {sections.map((s) => (
          <section key={s.id}>
            <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
              {s.title}
            </h2>
            <div
              className="mt-2 text-sm leading-relaxed text-[var(--color-text)] [&_a]:text-[var(--color-accent)] [&_code]:text-[var(--color-accent)] [&_li]:ml-4 [&_li]:list-disc [&_p]:mt-2 [&_ul]:mt-2"
              dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
            />
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm text-[var(--color-text)]">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I Agree — I am authorized to bind the Carrier and accept this Carrier
            Dispatch Services Agreement and the{" "}
            <Link
              href="/carrier/terms"
              className="font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              Terms of Service
            </Link>
            , including the <strong>{dispatchPercent}%</strong> default dispatch fee
            and the 7-day TMS software trial.
          </span>
        </label>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void accept()}
          className="mt-4 w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#05080f] disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Accept agreement"}
        </button>
      </div>
    </div>
  );
}
