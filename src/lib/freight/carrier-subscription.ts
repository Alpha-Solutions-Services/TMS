export type CarrierProfileSubscription = {
  carrier_subscription_status?: string | null;
  carrier_trial_ends_at?: string | null;
  carrier_stripe_subscription_id?: string | null;
  carrier_status?: string | null;
  carrier_billing_mode?: string | null;
  role?: string | null;
};

const ACTIVE_STATUSES = new Set(["trialing", "active"]);

export function carrierHasFreeBilling(profile: CarrierProfileSubscription): boolean {
  return profile.carrier_billing_mode?.toLowerCase() === "free";
}

export function carrierHasPortalAccess(profile: CarrierProfileSubscription): boolean {
  if (profile.role !== "carrier" || profile.carrier_status !== "verified") {
    return false;
  }

  if (carrierHasFreeBilling(profile)) return true;

  const status = profile.carrier_subscription_status?.toLowerCase();
  if (status && ACTIVE_STATUSES.has(status)) return true;

  const trialEnd = profile.carrier_trial_ends_at;
  if (trialEnd) {
    const end = new Date(trialEnd);
    if (!Number.isNaN(end.getTime()) && end.getTime() > Date.now()) {
      return true;
    }
  }

  return false;
}

export function carrierTrialDaysLeft(profile: CarrierProfileSubscription): number | null {
  const trialEnd = profile.carrier_trial_ends_at;
  if (!trialEnd) return null;
  const end = new Date(trialEnd);
  if (Number.isNaN(end.getTime())) return null;
  const diff = end.getTime() - Date.now();
  return Math.max(0, Math.ceil(diff / (24 * 60 * 60 * 1000)));
}

export function startCarrierTrialIso(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString();
}
