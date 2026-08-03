export type CarrierIdentityProfile = {
  role?: string | null;
  carrier_status?: string | null;
};

const CARRIER_LIFECYCLE = [
  "pending",
  "verified",
  "rejected",
  "suspended",
] as const;

/**
 * True when this profile should use the TMS carrier portal/APIs.
 * Drivers excluded first — invite accept can set carrier_status=pending on drivers.
 * Also true when role is student/etc. but carrier_status shows a real carrier lifecycle
 * (shared profiles.role across Learn/TMS).
 */
export function isCarrierIdentity(
  profile: CarrierIdentityProfile | null | undefined,
): boolean {
  if (!profile) return false;
  if (profile.role === "driver") return false;
  if (profile.role === "carrier") return true;
  const status = profile.carrier_status;
  return (
    typeof status === "string" &&
    (CARRIER_LIFECYCLE as readonly string[]).includes(status)
  );
}

/** Carrier portal + most carrier APIs: identity + verified status. */
export function isVerifiedCarrier(
  profile: CarrierIdentityProfile | null | undefined,
): boolean {
  return isCarrierIdentity(profile) && profile?.carrier_status === "verified";
}
