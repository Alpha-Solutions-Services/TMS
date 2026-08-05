"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  buildCarrierAgreementOnlySections,
  clampAgreementPercent,
} from "@/lib/freight/carrier-agreement-terms";

type Props = { token: string };

type SignedPayload = {
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  dispatchPercent: number;
  termsVersion: string;
  acceptedAt: string;
  acceptedIp: string | null;
};

/** Permanent electronically signed agreement record. */
export function CarrierAgreementSignedClient({ token }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<SignedPayload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/freight/carrier/agreement/${encodeURIComponent(token)}/signed`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? "Signed agreement not found");
        if (!cancelled) setData(json as SignedPayload);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Could not load signed agreement");
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
    if (!data) return [];
    return buildCarrierAgreementOnlySections({
      companyName: data.companyName,
      contactName: data.contactName,
      email: data.email,
      phone: data.phone,
      dispatchPercent: clampAgreementPercent(data.dispatchPercent),
      effectiveDate: new Date(data.acceptedAt).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      }),
    });
  }, [data]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-sm text-[var(--color-muted)]">
        Loading signed agreement…
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <h1 className="text-xl font-bold text-[var(--color-text)]">
          Signed agreement unavailable
        </h1>
        <p className="mt-2 text-sm text-red-200">{error ?? "Not found"}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
      <div className="flex items-center gap-4">
        <Image
          src="/afn-logo.png"
          alt="Alpha Freight Network"
          width={72}
          height={72}
          className="rounded-full border border-[var(--color-border)] bg-black"
          priority
        />
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Electronically signed
          </p>
          <h1
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Carrier Dispatch Services Agreement
          </h1>
        </div>
      </div>

      <div className="mt-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
        Accepted{" "}
        {new Date(data.acceptedAt).toLocaleString("en-US", {
          dateStyle: "long",
          timeStyle: "short",
        })}
        {data.acceptedIp ? ` · IP ${data.acceptedIp}` : ""} · Version{" "}
        <code>{data.termsVersion}</code>
      </div>

      <div className="mt-4 grid gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/50 p-4 text-sm sm:grid-cols-2">
        <p>
          <span className="text-[var(--color-muted)]">Company</span>
          <br />
          <strong>{data.companyName}</strong>
        </p>
        <p>
          <span className="text-[var(--color-muted)]">Contact</span>
          <br />
          <strong>{data.contactName}</strong>
        </p>
        <p>
          <span className="text-[var(--color-muted)]">Email</span>
          <br />
          <strong>{data.email}</strong>
        </p>
        <p>
          <span className="text-[var(--color-muted)]">Phone</span>
          <br />
          <strong>{data.phone}</strong>
        </p>
        <p className="sm:col-span-2">
          <span className="text-[var(--color-muted)]">Default dispatch fee</span>
          <br />
          <strong className="text-[var(--color-accent)]">
            {clampAgreementPercent(data.dispatchPercent)}%
          </strong>
        </p>
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
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--color-accent)]">
            Terms of Service
          </h2>
          <p className="mt-2 text-sm text-[var(--color-muted)]">
            Incorporated by reference.{" "}
            <Link
              href="/carrier/terms"
              className="font-semibold text-[var(--color-accent)] underline-offset-2 hover:underline"
            >
              Read the Terms of Service →
            </Link>
          </p>
        </section>
      </div>
    </div>
  );
}
