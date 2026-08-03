-- Fix: tms_users_update allowed a super_dispatcher (via user JWT, not service role)
-- to silently promote any user's role to 'super_dispatcher', since the policy
-- had no WITH CHECK and Postgres's default WITH CHECK = USING only re-verifies
-- the caller's own role, not the value being written. Same class of bug as the
-- Giftify RLS finding (missing WITH CHECK on a role column).
--
-- Confirmed: all legitimate super_dispatcher provisioning happens server-side
-- via the service role, which bypasses RLS. This fix only closes the direct
-- user-JWT UPDATE path, which no legitimate flow uses.
--
-- Scope: role-escalation-to-super_dispatcher only. active/carrier_id are
-- intentionally left writable by supers under this policy — separate follow-up.
--
-- Additive only — does NOT modify tms-schema.sql.
-- Run AFTER tms-schema.sql (and after tms-schema-fixes.sql if that file was applied).

-- ─── tms_users: tighten UPDATE check ─────────────────────────────────────────

DROP POLICY IF EXISTS tms_users_update ON tms_users;

CREATE POLICY tms_users_update ON tms_users FOR UPDATE TO authenticated
  USING (tms_my_role() = 'super_dispatcher')
  WITH CHECK (
    tms_my_role() = 'super_dispatcher'
    AND (
      role <> 'super_dispatcher'
      OR role = (SELECT role FROM tms_users WHERE id = tms_users.id)
    )
  );
