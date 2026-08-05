"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  CARRIER_AGREEMENT_TERMS_VERSION,
  buildCarrierAgreementOnlySections,
  clampAgreementPercent,
} from "@/lib/freight/carrier-agreement-terms";

/**
 * Carrier-facing e-sign preview.
 * Dispatcher sets % when sending; carrier only enters company, name, email, phone.
 * Open: /carrier/agreement/preview
 */
export function CarrierAgreementDraftPreview() {
  // In production this comes from the agreement token (dispatcher-chosen).
  const dispatchPercent = 5;

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);

  const sections = useMemo(
    () =>
      buildCarrierAgreementOnlySections({
        companyName,
        contactName,
        email,
        phone,
        dispatchPercent: clampAgreementPercent(dispatchPercent),
      }),
    [companyName, contactName, email, phone, dispatchPercent],
  );

  const canSubmit =
    agreed &&
    companyName.trim().length > 1 &&
    contactName.trim().length > 1 &&
    email.includes("@") &&
    phone.trim().length >= 7;

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
        DRAFT PREVIEW — sample fee locked at {dispatchPercent}%. Live links are
        created from <code>/dispatcher/agreements</code> (version{" "}
        <code>{CARRIER_AGREEMENT_TERMS_VERSION}</code>).
      </p>

      <h1
        className="mt-6 text-2xl font-bold text-[var(--color-text)]"
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
      </p>

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
            , including the{" "}
            <strong>{clampAgreementPercent(dispatchPercent)}%</strong> default
            dispatch fee and the 7-day TMS software trial.
          </span>
        </label>
        <button
          type="button"
          disabled={!canSubmit}
          className="mt-4 w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#05080f] disabled:opacity-40"
        >
          Accept agreement (preview — not live)
        </button>
      </div>
    </div>
  );
}
