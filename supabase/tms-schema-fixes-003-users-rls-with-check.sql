-- Fix v2: tms_users_update WITH CHECK self-correlation bug
-- Live check (2026-08-02) on ozuurnngrhqmttgubffc showed:
--   WHERE (tms_users_1.id = tms_users_1.id)  -- always true
-- so "keep existing super_dispatcher role" never actually bound to the row.
--
-- Same class of Postgres rewrite bug as tickets_update_own in
-- portal-crm-fixes-001. Use SECURITY DEFINER helper instead.
--
-- Additive. Replaces policy from tms-schema-fixes-002-users-rls.sql.
-- Apply once on shared DB. Do not edit tms-schema.sql.

CREATE OR REPLACE FUNCTION public.tms_user_row_role(p_id uuid)
RETURNS tms_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.tms_users WHERE id = p_id;
$$;

DROP POLICY IF EXISTS tms_users_update ON tms_users;

CREATE POLICY tms_users_update ON tms_users FOR UPDATE TO authenticated
  USING (tms_my_role() = 'super_dispatcher')
  WITH CHECK (
    tms_my_role() = 'super_dispatcher'
    AND (
      role IS DISTINCT FROM 'super_dispatcher'::tms_role
      OR role = public.tms_user_row_role(id)
    )
  );
