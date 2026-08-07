"use client";

import { useEffect, useMemo, useState } from "react";
import { buildRateConSections } from "@/lib/freight/rate-confirmations";

export function RateConSignClient({ token }: { token: string }) {
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<{
    loadNumber: string | null;
    broker: string | null;
    lane: string | null;
    companyName: string | null;
    rateAmount: number;
    dispatchPercent: number | null;
    termsVersion: string;
  } | null>(null);

  const [companyName, setCompanyName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/freight/carrier/rate-con/${encodeURIComponent(token)}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Invalid link");
        if (cancelled) return;
        setMeta({
          loadNumber: json.loadNumber ?? null,
          broker: json.broker ?? null,
          lane: json.lane ?? null,
          companyName: json.companyName ?? null,
          rateAmount: Number(json.rateAmount) || 0,
          dispatchPercent:
            json.dispatchPercent == null ? null : Number(json.dispatchPercent),
          termsVersion: json.termsVersion ?? "rc-v1-2026-08",
        });
        if (json.companyName) setCompanyName(String(json.companyName));
      } catch (e) {
        if (!cancelled) {
          setLoadFailed(e instanceof Error ? e.message : "Could not load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const sections = useMemo(() => {
    if (!meta) return [];
    return buildRateConSections({
      company_name: companyName || meta.companyName,
      load_number: meta.loadNumber,
      broker: meta.broker,
      lane: meta.lane,
      rate_amount: meta.rateAmount,
      dispatch_percent: meta.dispatchPercent,
      terms_version: meta.termsVersion,
    });
  }, [meta, companyName]);

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
        `/api/freight/carrier/rate-con/${encodeURIComponent(token)}`,
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
      if (!res.ok) throw new Error(json.error ?? "Could not sign");
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-sm text-[var(--color-muted)]">
        Loading rate confirmation…
      </div>
    );
  }

  if (loadFailed) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-xl font-bold text-[var(--color-text)]">Unavailable</h1>
        <p className="mt-2 text-sm text-red-200">{loadFailed}</p>
      </div>
    );
  }

  if (done) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10">
        <h1 className="text-2xl font-bold text-[var(--color-text)]">Signed</h1>
        <p className="mt-2 text-sm text-[var(--color-muted)]">
          Thank you. Your rate confirmation has been recorded.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <h1
        className="text-2xl font-bold text-[var(--color-text)]"
        style={{ fontFamily: "var(--font-display)" }}
      >
        Rate confirmation
      </h1>
      <p className="mt-2 text-sm text-[var(--color-muted)]">
        Review the load rate and sign electronically.
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
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)]">
          Your name
          <input
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)]">
          Phone
          <input
            type="tel"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </label>
        <label className="block text-xs text-[var(--color-muted)] sm:col-span-2">
          Email
          <input
            type="email"
            className="dispatch-field mt-1 w-full rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
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
              className="mt-2 text-sm leading-relaxed text-[var(--color-text)] [&_code]:text-[var(--color-accent)] [&_p]:mt-2"
              dangerouslySetInnerHTML={{ __html: s.bodyHtml }}
            />
          </section>
        ))}
      </div>

      <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-4">
        <label className="flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
          />
          <span>
            I Agree — I am authorized to bind the Carrier to this rate confirmation.
          </span>
        </label>
        <button
          type="button"
          disabled={!canSubmit}
          onClick={() => void accept()}
          className="mt-4 w-full rounded-xl bg-[var(--color-accent)] px-4 py-3 text-sm font-semibold text-[#05080f] disabled:opacity-40"
        >
          {busy ? "Submitting…" : "Sign rate confirmation"}
        </button>
      </div>
    </div>
  );
}
