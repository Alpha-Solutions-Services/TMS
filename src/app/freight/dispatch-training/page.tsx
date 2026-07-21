import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { DispatchTrainingCheckoutButton } from "@/components/freight/DispatchTrainingCheckoutButton";

const WHATSAPP = "https://wa.me/923494206922";

export function generateMetadata(): Metadata {
  const title =
    "Truck Dispatcher Training Course | Alpha Freight Network";
  const description =
    "Online freight dispatch training for $120. Learn load boards, negotiation basics, and carrier workflows. Enroll via WhatsApp with Alpha Freight Network.";
  const url = "https://www.alphasolutions.software/freight/dispatch-training";
  return {
    title,
    description,
    keywords: [
      "dispatch training",
      "freight dispatcher course",
      "learn truck dispatching",
      "online dispatch school",
      "load board training",
      "trucking dispatcher $120",
      "MC carrier training",
      "freight broker dispatch",
      "Alpha Freight Network",
      "trucking back office training",
    ],
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "website",
    },
  };
}

const included = [
  "Self-paced modules you can complete on your schedule",
  "Load board fundamentals (search, post, and follow-up discipline)",
  "Rate negotiation framing: when to walk, when to commit",
  "Dispatch desk workflows from booking through delivery paperwork",
  "Compliance touchpoints carriers cannot ignore (high level, not legal advice)",
  "Templates and checklists you can reuse in a real operation",
] as const;

const audience = [
  "New dispatchers supporting a family MC or small fleet",
  "Owner-operators who want to understand dispatch before outsourcing",
  "Brokers or carrier reps transitioning into dispatch coverage",
  "Anyone preparing to work under a US motor carrier with authority",
] as const;

export default function DispatchTrainingPage() {
  return (
    <main className="min-h-screen bg-[var(--color-bg)]">
      <header className="border-b border-[var(--color-border)] px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <nav
            className="mb-8 flex flex-wrap items-center gap-2 text-xs text-[var(--color-muted)]"
            aria-label="Breadcrumb"
          >
            <Link href="/" className="hover:text-[var(--color-accent)]">
              Home
            </Link>
            <span aria-hidden>/</span>
            <Link href="/freight" className="hover:text-[var(--color-accent)]">
              Alpha Freight Network
            </Link>
            <span aria-hidden>/</span>
            <span className="text-[var(--color-text)]">Dispatch training</span>
          </nav>
          <div className="mb-6">
            <Image
              src="/alpha-logo.png"
              alt="Alpha Solutions Services LLC"
              width={56}
              height={56}
              className="h-14 w-14 rounded-xl object-cover ring-1 ring-[var(--color-border)]"
              priority
            />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--color-accent)]">
            Alpha Freight Network · Education
          </p>
          <h1
            className="mt-3 text-4xl font-bold tracking-tight text-[var(--color-text)] sm:text-5xl"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Dispatch training course
          </h1>
          <p className="mt-4 text-lg text-[var(--color-muted)]">
            Learn professional freight dispatching online — one-time enrollment.
          </p>
          <div className="mt-8 flex flex-wrap items-baseline gap-3">
            <span className="text-4xl font-bold text-[var(--color-accent)] sm:text-5xl">
              $120
            </span>
            <span className="text-sm font-medium text-[var(--color-muted)]">
              one-time · online access
            </span>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-16 px-4 py-16 sm:px-6 lg:px-8">
        <section aria-labelledby="included-heading">
          <h2
            id="included-heading"
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            What&apos;s included
          </h2>
          <ul className="mt-6 space-y-3 text-[var(--color-muted)]">
            {included.map((line) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="who-heading">
          <h2
            id="who-heading"
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            Who it&apos;s for
          </h2>
          <ul className="mt-6 space-y-3 text-[var(--color-muted)]">
            {audience.map((line) => (
              <li key={line} className="flex gap-3 text-sm leading-relaxed">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--color-accent)]"
                  aria-hidden
                />
                {line}
              </li>
            ))}
          </ul>
        </section>

        <section
          className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/30 p-8"
          aria-labelledby="enroll-heading"
        >
          <h2
            id="enroll-heading"
            className="text-2xl font-bold text-[var(--color-text)]"
            style={{ fontFamily: "var(--font-display), sans-serif" }}
          >
            How to enroll
          </h2>
          <ol className="mt-6 list-decimal space-y-4 pl-5 text-sm leading-relaxed text-[var(--color-muted)]">
            <li>
              Message us on WhatsApp with the subject line{" "}
              <strong className="text-[var(--color-text)]">
                Dispatch training — $120
              </strong>
              .
            </li>
            <li>
              We confirm availability, send payment instructions, and issue
              access details for the course materials.
            </li>
            <li>
              Complete modules at your pace. Optional: add dispatch or
              compliance services from Alpha Freight Network when you are ready
              to scale.
            </li>
          </ol>
          <DispatchTrainingCheckoutButton />
          <a
            href={WHATSAPP}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex w-full items-center justify-center rounded-lg border border-[var(--color-border)] bg-transparent px-8 py-4 text-sm font-semibold text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] sm:w-auto"
          >
            Prefer WhatsApp? Message us
          </a>
          <p className="mt-4 text-xs text-[var(--color-muted)]">
            This course is educational and operational in nature—not legal or
            financial advice. Motor carriers remain responsible for regulatory
            compliance.
          </p>
        </section>

        <p className="text-center text-sm text-[var(--color-muted)]">
          <Link
            href="/freight"
            className="font-medium text-[var(--color-accent)] hover:underline"
          >
            ← Back to Alpha Freight Network
          </Link>
        </p>
      </div>
    </main>
  );
}
