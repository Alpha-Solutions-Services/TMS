import type { SupabaseClient } from "@supabase/supabase-js";

/** Fields the register routes write onto profiles (must match base / baseProfile). */
export type CarrierRegistrationProfileSnapshot = {
  email: string | null;
  full_name: string | null;
  phone: string | null;
  role: string | null;
  mc_number: string | null;
  dot_number: string | null;
  company_name: string | null;
  company_address: string | null;
  carrier_status: string | null;
  fmcsa_verified: boolean | null;
  fmcsa_verified_at: string | null;
  fmcsa_data: unknown;
  enrollment_status: string | null;
  carrier_payment_preference: string | null;
  carrier_review_note: string | null;
};

const SNAPSHOT_SELECT =
  "email, full_name, phone, role, mc_number, dot_number, company_name, company_address, carrier_status, fmcsa_verified, fmcsa_verified_at, fmcsa_data, enrollment_status, carrier_payment_preference, carrier_review_note";

export async function captureCarrierRegistrationSnapshot(
  admin: SupabaseClient,
  userId: string,
): Promise<CarrierRegistrationProfileSnapshot | null> {
  const { data } = await admin
    .from("profiles")
    .select(SNAPSHOT_SELECT)
    .eq("id", userId)
    .maybeSingle();
  return (data as CarrierRegistrationProfileSnapshot | null) ?? null;
}

/**
 * Undo registration after required document uploads fail.
 * - New auth user: deleteUser.
 * - Profile was inserted this attempt: delete profile row.
 * - Profile was updated: restore exact pre-update snapshot (preserves Learn student, etc.).
 */
export async function rollbackFailedCarrierRegistration(params: {
  admin: SupabaseClient;
  userId: string;
  createdNewAuthUser: boolean;
  profileInserted: boolean;
  /** Required when profileInserted === false and a row existed before update. */
  priorSnapshot: CarrierRegistrationProfileSnapshot | null;
}): Promise<void> {
  const { admin, userId, createdNewAuthUser, profileInserted, priorSnapshot } =
    params;

  const { error: docsErr } = await admin
    .from("tms_carrier_documents")
    .delete()
    .eq("carrier_profile_id", userId);
  if (docsErr) {
    console.error("[rollback-carrier] delete docs", docsErr);
  }

  if (createdNewAuthUser) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error("[rollback-carrier] deleteUser", error);
    return;
  }

  if (profileInserted) {
    const { error } = await admin.from("profiles").delete().eq("id", userId);
    if (error) console.error("[rollback-carrier] delete profile", error);
    return;
  }

  if (priorSnapshot) {
    const { error } = await admin
      .from("profiles")
      .update({
        email: priorSnapshot.email,
        full_name: priorSnapshot.full_name,
        phone: priorSnapshot.phone,
        role: priorSnapshot.role,
        mc_number: priorSnapshot.mc_number,
        dot_number: priorSnapshot.dot_number,
        company_name: priorSnapshot.company_name,
        company_address: priorSnapshot.company_address,
        carrier_status: priorSnapshot.carrier_status,
        fmcsa_verified: priorSnapshot.fmcsa_verified,
        fmcsa_verified_at: priorSnapshot.fmcsa_verified_at,
        fmcsa_data: priorSnapshot.fmcsa_data,
        enrollment_status: priorSnapshot.enrollment_status,
        carrier_payment_preference: priorSnapshot.carrier_payment_preference,
        carrier_review_note: priorSnapshot.carrier_review_note,
      })
      .eq("id", userId);
    if (error) console.error("[rollback-carrier] restore snapshot", error);
    return;
  }

  console.error(
    "[rollback-carrier] missing priorSnapshot for updated profile",
    userId,
  );
}
