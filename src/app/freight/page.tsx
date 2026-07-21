import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { absoluteUrl, COMPANY, SITE_BRAND_SHORT } from "@/data/site";

const WHATSAPP = "https://wa.me/923494206922";

const title =
  "Alpha Freight — Smart Dispatching & Load Management";
const description =
  "Manage loads, track drivers, and grow your carrier business with Alpha Freight — dispatch desks, onboarding, academy, and compliance touchpoints scoped to US motor carriers.";
const canon = absoluteUrl("/freight");

export const metadata: Metadata = {
  title,
  description,
  keywords: [
    "freight dispatch",
    "trucking dispatch services",
    "FMCSA compliance",
    "motor carrier",
    "MC number",
    "DOT compliance",
    "trucking back office",
    "DAT load board",
    "carrier sales",
    "dispatch training",
    "US trucking",
    "Alpha Freight Network",
  ],
  alternates: { canonical: canon },
  openGraph: {
    title,
    description,
    url: canon,
    siteName: SITE_BRAND_SHORT,
    type: "website",
  },
};

const coreServices = [
  {
    title: "Dispatching",
    detail: "8% / 6%",
    body: "Load coverage, rate negotiation, and carrier coordination so your trucks stay moving and margins stay defendable.",
  },
  {
    title: "Driver hunting",
    detail: "Recruiting support",
    body: "Sourcing and screening conversations aligned to your safety and compliance standards—not spray-and-pray leads.",
  },
  {
    title: "MC lease-on",
    detail: "Authority programs",
    body: "Structured lease-on workflows that keep filings, insurance expectations, and revenue splits explicit from day one.",
  },
  {
    title: "Carrier sales",
    detail: "Growth",
    body: "Outbound positioning for your lanes and capacity so you are in more broker and shipper conversations.",
  },
  {
    title: "DAT management",
    detail: "Load board ops",
    body: "Search discipline, posting hygiene, and follow-up cadence so DAT spend converts to booked freight.",
  },
  {
    title: "FMCSA compliance",
    detail: "Safety & filings",
    body: "Monitoring reminders, document hygiene, and escalation paths that reduce audit surprises and downtime risk.",
  },
] as const;

const newServicesStrip = [
  { label: "Trucking co. setup", price: "$799" },
  { label: "DOT number", price: "$149" },
  { label: "MC number", price: "$199" },
  { label: "EIN", price: "$99" },
  { label: "Trucking website", price: "$499" },
] as const;

const dispatchSteps = [
  {
    step: "01",
    title: "You find loads",
    body: "We align on lanes, minimums, and the brokers or shippers you want in rotation.",
  },
  {
    step: "02",
    title: "We negotiate",
    body: "Our team works rates, accessorials, and appointment realities before you commit equipment.",
  },
  {
    step: "03",
    title: "Carrier delivers",
    body: "Dispatch support through pickup, transit, and delivery—documentation captured as you go.",
  },
  {
    step: "04",
    title: "You get paid",
    body: "Invoice hygiene and follow-up so completed loads close out cleanly and cash hits faster.",
  },
] as const;

const freightFaqs = [
  {
    q: "Do you dispatch for owner-operators only or also for fleets?",
    a: "Both. We work with solo owner-operators and fleets up to 20+ trucks.",
  },
  {
    q: "What is your dispatch fee?",
    a: "8% of gross per load for standard service, 6% for long-term contracts.",
  },
  {
    q: "What lanes and freight types do you cover?",
    a: "Dry van, reefer, flatbed, and step deck. We cover all 48 continental US states.",
  },
  {
    q: "Do you handle FMCSA compliance paperwork?",
    a: "Yes. We offer full FMCSA compliance support as a separate service including DOT filings, drug consortium enrollment, and safety audits.",
  },
  {
    q: "How do I get started?",
    a: "WhatsApp us or fill out the contact form. We onboard new carriers within 24-48 hours.",
  },
] as const;

const serviceLd = {
  "@context": "https://schema.org",
  "@type": "Service",
  serviceType:
    "Freight dispatch and motor carrier onboarding services backed by Alpha Solutions.",
  provider: {
    "@type": "Organization",
    name: COMPANY.name,
    url: absoluteUrl("/"),
    logo: COMPANY.logoUrl,
  },
  areaServed: "United States",
  url: canon,
};

export default function FreightLandingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(serviceLd) }}
      />
      {/* Hero */}
      <header className="relative overflow-hidden border-b border-[var(--color-border)] px-4 pb-20 pt-16 sm:px-6 sm:pb-28 sm:pt-20 lg:px-8">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.12]"
          aria-hidden
          style={{
            background:
              "radial-gradient(ellipse 70% 45% at 50% -10%, var(--color-accent), transparent)",
          }}
        />
        <div className="relative mx-auto max-w-4xl text-center">
          <div className="mb-5 flex justify-center">
            <Image
              src="/alpha-logo.png"
              alt="Alpha Solutions Services LLC"
              width={64}
              height={64}
              className="h-16 w-16 rounded-2xl object-cover ring-1 ring-[var(--color-border)]"
              priority
            />
          </div>
          <p
            className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]"
          >
            Alpha Solutions · Dedicated freight division
          </p>
          <h1
            className="text-4xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl lg:text-6xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Alpha Freight Network
          </h1>
          <p
            className="mx-auto mt-5 max-w-2xl text-xl font-semibold text-[var(--color-text)] sm:text-2xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            The back-office for your trucking operation
          </p>
          <p
            className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-[var(--color-muted)] sm:text-lg"
          >
            <span className="font-medium text-[var(--color-accent)]">
              Dispatching, compliance, and training for US trucking operations
            </span>
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <a
              href={WHATSAPP}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-w-[220px] items-center justify-center rounded-lg bg-[var(--color-accent)] px-8 py-3.5 text-sm font-semibold text-[#05080F] transition-opacity hover:opacity-90"
            >
              Message on WhatsApp
            </a>
            <Link
              href="/login"
              className="inline-flex min-w-[220px] items-center justify-center rounded-lg border border-[var(--color-accent)]/40 bg-[var(--color-accent)]/10 px-8 py-3.5 text-sm font-semibold text-[var(--color-accent)] transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/15"
            >
              Freight Portal
            </Link>
            <Link
              href="/freight/student"
              className="inline-flex min-w-[220px] items-center justify-center rounded-lg border border-[var(--color-border)] px-8 py-3.5 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]"
            >
              Academy &amp; training
            </Link>
          </div>
        </div>
      </header>

      {/* Core services */}
      <section
        className="border-b border-[var(--color-border)] px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="core-services-heading"
      >
        <div className="mx-auto max-w-7xl">
          <h2
            id="core-services-heading"
            className="text-center text-3xl font-bold text-[var(--color-text)] sm:text-4xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Core services
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--color-muted)]">
            Built for carriers and dispatch desks that need execution, not
            generic marketing promises.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {coreServices.map((item) => (
              <article
                key={item.title}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/40 p-6 transition-colors hover:border-[var(--color-accent)]/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <h3
                    className="text-lg font-bold text-[var(--color-text)]"
                    style={{ fontFamily: "var(--font-display), sans-serif" }}
                  >
                    {item.title}
                  </h3>
                  <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-[var(--color-accent)]">
                    {item.detail}
                  </span>
                </div>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                  {item.body}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* NEW services strip */}
      <section
        className="border-b border-[var(--color-border)] px-4 py-12 sm:px-6 lg:px-8"
        aria-labelledby="new-services-heading"
      >
        <div className="mx-auto max-w-7xl">
          <div className="flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-4">
            <span
              id="new-services-heading"
              className="rounded-full bg-[var(--color-accent)] px-3 py-1 text-xs font-bold uppercase tracking-wider text-[#05080F]"
            >
              New
            </span>
            <p className="text-center text-sm font-medium text-[var(--color-text)] sm:text-left">
              Fast-start programs for authority, filings, and web presence
            </p>
          </div>
          <div className="mt-8 flex flex-wrap justify-center gap-4 sm:gap-6">
            {newServicesStrip.map((row) => (
              <div
                key={row.label}
                className="flex min-w-[140px] flex-col items-center rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 px-5 py-4 text-center"
              >
                <span className="text-xs text-[var(--color-muted)]">
                  {row.label}
                </span>
                <span className="mt-1 text-xl font-bold text-[var(--color-accent)]">
                  {row.price}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-[var(--color-muted)]">
            Government fees may apply separately. Final scope confirmed in
            writing before kickoff.
          </p>
        </div>
      </section>

      {/* Dispatch training CTA */}
      <section className="border-b border-[var(--color-border)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Link
            href="/freight/student/enroll"
            className="block overflow-hidden rounded-2xl border-2 border-[var(--color-accent)]/50 bg-[var(--color-accent-dim)] p-8 text-center transition-colors hover:border-[var(--color-accent)] hover:bg-[var(--color-accent)]/15 sm:p-10"
          >
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-accent)]">
              Online course
            </p>
            <h2
              className="mt-3 text-2xl font-bold text-[var(--color-text)] sm:text-3xl"
              style={{ fontFamily: "var(--font-display), sans-serif" }}
            >
              Learn dispatching for $120
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-sm text-[var(--color-muted)]">
              Self-paced fundamentals: load boards, negotiation basics,
              compliance touchpoints, and how professional dispatch desks run
              day-to-day.
            </p>
            <span className="mt-8 inline-flex items-center justify-center rounded-lg bg-[var(--color-accent)] px-8 py-3.5 text-sm font-semibold text-[#05080F]">
              View course details →
            </span>
          </Link>
        </div>
      </section>

      {/* How dispatching works */}
      <section
        className="border-b border-[var(--color-border)] px-4 py-16 sm:px-6 lg:px-8"
        aria-labelledby="how-heading"
      >
        <div className="mx-auto max-w-7xl">
          <h2
            id="how-heading"
            className="text-center text-3xl font-bold text-[var(--color-text)] sm:text-4xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            How dispatching works with us
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--color-muted)]">
            A straight-line mental model your drivers and finance team can
            repeat.
          </p>
          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {dispatchSteps.map((s) => (
              <div
                key={s.step}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/25 p-6"
              >
                <span
                  className="text-2xl font-bold text-[var(--color-accent)]"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  {s.step}
                </span>
                <h3
                  className="mt-2 text-lg font-bold text-[var(--color-text)]"
                  style={{ fontFamily: "var(--font-display), sans-serif" }}
                >
                  {s.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--color-muted)]">
                  {s.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="border-b border-[var(--color-border)] px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <h2
            className="text-center text-3xl font-bold text-[var(--color-text)] sm:text-4xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Freight dispatch FAQ
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-sm text-[var(--color-muted)]">
            Practical answers for trucking dispatch services, FMCSA compliance,
            and carrier onboarding.
          </p>
          <div className="mt-10 grid gap-3">
            {freightFaqs.map((item) => (
              <details
                key={item.q}
                className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-4"
              >
                <summary className="cursor-pointer text-sm font-semibold text-[var(--color-text)]">
                  {item.q}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-[var(--color-muted)]">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* WhatsApp CTA */}
      <section className="px-4 py-16 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl rounded-2xl border border-[var(--color-accent)]/35 bg-[var(--color-accent-dim)] p-10 text-center">
          <h2
            className="text-2xl font-bold text-[var(--color-text)] sm:text-3xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Start dispatching today — message us on WhatsApp
          </h2>
          <p className="mt-3 text-[var(--color-muted)]">
            Tell us your MC/DOT status, lanes, and what you need handled first.
          </p>
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-8 inline-flex items-center justify-center rounded-lg bg-[#25D366] px-8 py-3.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          >
            WhatsApp Alpha Freight Network
          </a>
        </div>
      </section>
    </main>
  );
}
