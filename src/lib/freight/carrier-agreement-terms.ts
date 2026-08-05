/**
 * Carrier Dispatch Services Agreement + Terms of Service (v2).
 * Carrier e-sign shows Agreement only; ToS lives on /carrier/terms.
 */
export const CARRIER_AGREEMENT_TERMS_VERSION = "v2-2026-08";

/** Server / dispatcher validation only — never show this range to carriers. */
export const CARRIER_AGREEMENT_PERCENT_MIN = 2;
export const CARRIER_AGREEMENT_PERCENT_MAX = 100;

export type CarrierAgreementTermsInput = {
  companyName: string;
  contactName?: string;
  email: string;
  phone?: string;
  /** Set by dispatcher when sending — shown as a fixed % to the carrier */
  dispatchPercent: number;
  effectiveDate?: string;
};

export function clampAgreementPercent(n: number): number {
  if (!Number.isFinite(n)) return CARRIER_AGREEMENT_PERCENT_MIN;
  return Math.min(
    CARRIER_AGREEMENT_PERCENT_MAX,
    Math.max(CARRIER_AGREEMENT_PERCENT_MIN, Math.round(n * 100) / 100),
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function displayMeta(input: CarrierAgreementTermsInput) {
  const percent = clampAgreementPercent(input.dispatchPercent);
  const date =
    input.effectiveDate ||
    new Date().toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  return {
    percent,
    date,
    company: input.companyName.trim() || "[Carrier Company]",
    contact: input.contactName?.trim() || "[Contact Name]",
    email: input.email.trim() || "[email]",
    phone: input.phone?.trim() || "",
  };
}

export type AgreementDocSection = {
  id: string;
  title: string;
  bodyHtml: string;
};

/** Agreement sections only (carrier e-sign page). */
export function buildCarrierAgreementOnlySections(
  input: CarrierAgreementTermsInput,
): AgreementDocSection[] {
  const { percent, date, company, contact, email, phone } = displayMeta(input);
  const c = escapeHtml(company);
  const n = escapeHtml(contact);
  const e = escapeHtml(email);
  const p = escapeHtml(phone);
  const d = escapeHtml(date);
  const phoneLine = p ? `<br/>Phone: ${p}` : "";

  return [
    {
      id: "header",
      title: "Carrier Dispatch Services Agreement",
      bodyHtml: `
        <p><strong>Dispatcher:</strong> Alpha Solutions Services LLC d/b/a Alpha Freight Network</p>
        <p><strong>Carrier:</strong> ${c}<br/>
        Contact: ${n} &lt;${e}&gt;${phoneLine}<br/>
        Effective: ${d}<br/>
        Terms version: <code>${CARRIER_AGREEMENT_TERMS_VERSION}</code><br/>
        <strong>Default dispatch fee: ${percent}%</strong></p>
      `,
    },
    {
      id: "a1",
      title: "1. Parties",
      bodyHtml: `
        <p>This Carrier Dispatch Services Agreement (“Agreement”) is entered into between Alpha Solutions Services LLC d/b/a Alpha Freight Network (“Dispatcher”) and the Carrier identified during registration (“Carrier”).</p>
      `,
    },
    {
      id: "a2",
      title: "2. Services",
      bodyHtml: `
        <p>Dispatcher agrees to provide dispatch-related administrative services, including:</p>
        <ul>
          <li>Load sourcing</li>
          <li>Load negotiation</li>
          <li>Broker and shipper communication</li>
          <li>Rate confirmation review</li>
          <li>Appointment scheduling</li>
          <li>Document management</li>
          <li>Invoice assistance</li>
          <li>TMS access</li>
        </ul>
        <p>Dispatcher is not acting as a freight broker under this Agreement unless separately authorized by law and contracted to do so.</p>
      `,
    },
    {
      id: "a3",
      title: "3. Independent Contractor",
      bodyHtml: `
        <p>Carrier is an independent motor carrier and remains solely responsible for:</p>
        <ul>
          <li>FMCSA compliance</li>
          <li>Drivers</li>
          <li>Equipment</li>
          <li>Insurance</li>
          <li>Operating authority</li>
          <li>Taxes</li>
          <li>Safety</li>
          <li>Cargo</li>
          <li>Hours of Service</li>
          <li>All transportation operations</li>
        </ul>
        <p>Nothing in this Agreement creates an employer, partnership, joint venture, or agency relationship.</p>
      `,
    },
    {
      id: "a4",
      title: "4. Dispatch Fees",
      bodyHtml: `
        <p>Carrier agrees to pay the dispatch fee shown in the TMS.</p>
        <p>The default dispatch fee for newly created loads is <strong>${percent}%</strong>, unless a different percentage is assigned to a specific load.</p>
        <p>Dispatch fees become earned once Carrier accepts a load procured by Dispatcher.</p>
      `,
    },
    {
      id: "a5",
      title: "5. TMS Access",
      bodyHtml: `
        <p>Carrier will receive access to Alpha Freight Network’s Transportation Management System (TMS).</p>
        <p>Each user requires a separate paid subscription unless otherwise agreed.</p>
        <p>Carrier receives a <strong>7-day free trial</strong> of the TMS software only.</p>
        <p>The trial does not waive dispatch fees for any loads dispatched during the trial period.</p>
      `,
    },
    {
      id: "a6",
      title: "6. Billing & Payment",
      bodyHtml: `
        <p>The billing cycle runs from <strong>Friday through the following Thursday</strong>.</p>
        <p>Dispatcher will issue a weekly invoice for all delivered loads during that billing cycle.</p>
        <p>Payment is due within <strong>one (1) business day</strong> after the invoice is issued.</p>
        <p>If payment is not received within <strong>two (2) calendar days</strong> after the due date, a <strong>$10.00 USD</strong> late fee will be added to the outstanding invoice. If payment remains delayed thereafter, an additional <strong>$10.00 USD per day</strong> may be added until the outstanding invoice is paid in full.</p>
      `,
    },
    {
      id: "a7",
      title: "7. Electronic Acceptance",
      bodyHtml: `
        <p>By selecting “I Agree” and accepting this Agreement electronically, Carrier agrees to be legally bound by this Agreement and the Alpha Freight Network Terms of Service.</p>
        <p>Electronic acceptance records may include: Name, Email, Phone, IP Address, Date &amp; Time, Browser/User Agent, and Terms Version.</p>
      `,
    },
    {
      id: "a8",
      title: "8. Governing Law",
      bodyHtml: `
        <p>This Agreement shall be governed by the laws of the state where the Carrier’s principal place of business is located.</p>
      `,
    },
    {
      id: "a9",
      title: "9. Entire Agreement",
      bodyHtml: `
        <p>This Agreement, together with the Alpha Freight Network Terms of Service and Privacy Policy, constitutes the entire agreement between the parties.</p>
        <p><a href="/carrier/terms" style="color:#38a3ff;font-weight:600">Read the Terms of Service →</a></p>
      `,
    },
  ];
}

/** Terms of Service only — /carrier/terms */
export function buildCarrierTermsOfServiceSections(): AgreementDocSection[] {
  return [
    {
      id: "tos-default",
      title: "Payment Default",
      bodyHtml: `<p>Failure to pay is a material breach of contract. Dispatcher may suspend or terminate services immediately.</p>`,
    },
    {
      id: "tos-collection",
      title: "Collection Costs",
      bodyHtml: `<p>Carrier must pay all collection costs, attorney’s fees, court costs, filing fees, and other expenses incurred in collecting unpaid amounts, where permitted by law.</p>`,
    },
    {
      id: "tos-legal",
      title: "Legal Action",
      bodyHtml: `<p>Dispatcher may pursue any legal or equitable remedy available under applicable law, including filing suit to recover unpaid invoices, late fees, interest, damages, and collection costs.</p>`,
    },
    {
      id: "tos-interest",
      title: "Interest",
      bodyHtml: `<p>Unpaid balances may accrue interest at the maximum rate permitted by applicable law.</p>`,
    },
    {
      id: "tos-suspension",
      title: "Suspension",
      bodyHtml: `<p>Dispatcher may suspend dispatch services and revoke TMS access until all outstanding balances are paid in full.</p>`,
    },
    {
      id: "tos-refunds",
      title: "No Refunds",
      bodyHtml: `<p>Dispatch fees are earned upon Carrier’s acceptance of a dispatched load and are non-refundable.</p>`,
    },
    {
      id: "tos-liability",
      title: "Limitation of Liability",
      bodyHtml: `<p>Dispatcher is not responsible for broker non-payment, cargo claims, freight loss, equipment damage, driver conduct, or delays unless caused by Dispatcher’s willful misconduct.</p>`,
    },
    {
      id: "tos-indemnity",
      title: "Indemnification",
      bodyHtml: `<p>Carrier agrees to indemnify and hold Dispatcher harmless from claims arising from the Carrier’s operations, drivers, vehicles, or regulatory violations.</p>`,
    },
    {
      id: "tos-fmcsa",
      title: "FMCSA Compliance",
      bodyHtml: `<p>Carrier is solely responsible for complying with all applicable FMCSA regulations and maintaining all required operating authority, licenses, permits, and insurance.</p>`,
    },
    {
      id: "tos-esign",
      title: "Electronic Signatures",
      bodyHtml: `<p>Electronic acceptance is valid under the Electronic Signatures in Global and National Commerce Act (E-SIGN Act) and, where applicable, the Uniform Electronic Transactions Act (UETA).</p>`,
    },
  ];
}

/** @deprecated use buildCarrierAgreementOnlySections */
export function buildCarrierAgreementHtmlSections(
  input: CarrierAgreementTermsInput,
): AgreementDocSection[] {
  return [
    ...buildCarrierAgreementOnlySections(input),
    ...buildCarrierTermsOfServiceSections(),
  ];
}

export function buildCarrierAgreementPlainText(
  input: CarrierAgreementTermsInput,
): string {
  const { percent, date, company, contact, email, phone } = displayMeta(input);
  const phoneLine = phone ? `\nPhone: ${phone}` : "";

  return `
CARRIER DISPATCH SERVICES AGREEMENT
Alpha Solutions Services LLC d/b/a Alpha Freight Network (“Dispatcher”)
and ${company} (“Carrier”)

Terms version: ${CARRIER_AGREEMENT_TERMS_VERSION}
Effective date: ${date}
Carrier contact: ${contact} <${email}>${phoneLine}
Default dispatch fee: ${percent}%

(Full agreement text is shown in the TMS e-sign page. Terms of Service: /carrier/terms)

1. PARTIES — Agreement between Dispatcher and Carrier identified during registration.
2. SERVICES — Load sourcing, negotiation, broker/shipper communication, RC review, appointments, documents, invoice assistance, TMS access. Dispatcher is not a freight broker under this Agreement unless separately authorized and contracted.
3. INDEPENDENT CONTRACTOR — Carrier responsible for FMCSA, drivers, equipment, insurance, authority, taxes, safety, cargo, HOS, and all transportation operations.
4. DISPATCH FEES — Default ${percent}% on newly created loads unless a load specifies otherwise. Fees earned when Carrier accepts a load procured by Dispatcher.
5. TMS ACCESS — 7-day free trial of TMS software only; trial does not waive dispatch fees.
6. BILLING — Friday through following Thursday. Weekly invoice for delivered loads. Due within 1 business day. $10 late fee after 2 calendar days past due; then $10 per day until paid.
7. ELECTRONIC ACCEPTANCE — “I Agree” binds Carrier to this Agreement and the Terms of Service.
8. GOVERNING LAW — Laws of the state of Carrier’s principal place of business.
9. ENTIRE AGREEMENT — This Agreement + Terms of Service + Privacy Policy.
`.trim();
}
