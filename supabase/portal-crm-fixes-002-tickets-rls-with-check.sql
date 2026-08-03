-- Fix v2: tickets_update_own WITH CHECK must not self-correlate as
--   WHERE support_tickets.id = support_tickets.id
-- Postgres rewrites that to always-true (support_tickets_1.id = support_tickets_1.id),
-- which breaks "preserve existing status/priority" intent.
--
-- Live check (2026-08-02) via Supabase MCP on ozuurnngrhqmttgubffc confirmed
-- the shadowed form was applied from portal-crm-fixes-001-tickets-rls.sql.
--
-- Fix: SECURITY DEFINER helpers read the stored row by id (SET search_path),
-- then WITH CHECK allows status = 'in_progress' OR unchanged status, and
-- priority must equal stored priority. Staff/service-role PATCH bypasses RLS.
--
-- Additive. Replaces policy from portal-crm-fixes-001. Apply once on shared DB.
-- Copied for TMS portal-crm fork parity.

CREATE OR REPLACE FUNCTION public.support_ticket_row_status(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.support_tickets WHERE id = p_id;
$$;

CREATE OR REPLACE FUNCTION public.support_ticket_row_priority(p_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT priority FROM public.support_tickets WHERE id = p_id;
$$;

DROP POLICY IF EXISTS tickets_update_own ON support_tickets;

CREATE POLICY tickets_update_own ON support_tickets FOR UPDATE TO authenticated
  USING (auth.uid() = client_user_id)
  WITH CHECK (
    auth.uid() = client_user_id
    AND (
      status = 'in_progress'
      OR status = public.support_ticket_row_status(id)
    )
    AND priority = public.support_ticket_row_priority(id)
  );
