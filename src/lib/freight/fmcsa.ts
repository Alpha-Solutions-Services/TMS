/** FMCSA QCMobile helpers for carrier verification */

export type FmcsaCarrierSummary = {
  companyName: string;
  mailingAddress: string;
  dotNumber?: string;
  fmcsaEmail: string | null;
  active: boolean;
  statusSummary: string;
  emailMatched: boolean;
  raw: Record<string, unknown>;
};

export function normalizeMcNumber(input: string) {
  return input.trim().replace(/^MC-/i, "").replace(/\D/g, "");
}

export function summarizeFmcsCarrier(
  carrier: Record<string, unknown>,
  emailEntered: string,
): FmcsaCarrierSummary {
  const companyName =
    String(carrier.legalName ?? carrier.name ?? "").trim() ||
    "Motor carrier";

  const streetParts = [
    carrier.phyStreet,
    carrier.phyCity,
    carrier.phyState,
    carrier.phyZipcode,
    carrier.phyCountry,
  ]
    .map((v) => (typeof v === "string" ? v.trim() : ""))
    .filter(Boolean);
  let mailingAddress = streetParts.join(", ");

  const mailing = carrier.mailingAddress;
  if (!mailingAddress && typeof mailing === "string") {
    mailingAddress = mailing.trim();
  } else if (
    !mailingAddress &&
    mailing &&
    typeof mailing === "object"
  ) {
    const m = mailing as Record<string, string>;
    mailingAddress = [m.street, m.city, m.state, m.zip].filter(Boolean).join(", ");
  }

  const emailRaw =
    carrier.email ??
    carrier.emailAddress ??
    carrier.primaryEmail ??
    carrier.emailAddr ??
    carrier.email_address;
  const fmcsaEmail =
    typeof emailRaw === "string" ? emailRaw.trim().toLowerCase() : null;

  const entered = emailEntered.trim().toLowerCase();
  const emailMatched = !fmcsaEmail || fmcsaEmail === entered;

  const statusSummary = String(carrier.statusCode ?? carrier.status ?? "");

  let active = carrier.statusCode === "A";
  const ao = carrier.allowedToOperate ?? carrier.operatingStatus;
  if (!active && (ao === "Y" || ao === "ACTIVE")) active = true;

  const dotRaw = carrier.dotNumber ?? carrier.dot_number ?? carrier.usdot;
  const dotNumber =
    typeof dotRaw === "number"
      ? String(dotRaw)
      : typeof dotRaw === "string"
        ? dotRaw
        : undefined;

  return {
    companyName,
    mailingAddress,
    fmcsaEmail,
    dotNumber,
    active,
    statusSummary,
    raw: carrier,
    emailMatched,
  };
}

export async function lookupCarrierByMcDocket(mcDigits: string, webKey: string) {
  const url = `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${encodeURIComponent(
    mcDigits,
  )}?webKey=${encodeURIComponent(webKey)}`;
  try {
    const res = await fetch(url, { next: { revalidate: 0 } });
    if (!res.ok) {
      return {
        ok: false as const,
        reason:
          res.status === 404
            ? ("not_found" as const)
            : ("http_error" as const),
      };
    }
    const json = (await res.json()) as Record<string, unknown>;
    const content = (json.content as Record<string, unknown> | undefined) ?? json;
    const carrier = content.carrier as Record<string, unknown> | undefined;
    if (!carrier) {
      return { ok: false as const, reason: "not_found" as const };
    }
    return { ok: true as const, carrier };
  } catch {
    return { ok: false as const, reason: "network" as const };
  }
}
