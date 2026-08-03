-- Fix: tickets_update_own allowed a client (user JWT) to set support_tickets.status
-- and .priority to any value with no WITH CHECK. Confirmed real usage only sets
-- status = 'in_progress' on reply; staff/service-role handles all other status
-- and priority changes and bypasses RLS regardless. This migration locks the
-- client-JWT path to that single legitimate transition.
--
-- Additive only — does NOT modify portal-crm.sql.
-- Run AFTER portal-crm.sql. Do not apply from this agent — human applies in SQL editor.
--
-- Table PK: support_tickets.id (uuid). Columns: status text, priority text,
-- client_user_id uuid (see portal-crm.sql).
-- Copied into TMS because this app forks portal-crm.sql with the same policy.

DROP POLICY IF EXISTS tickets_update_own ON support_tickets;

CREATE POLICY tickets_update_own ON support_tickets FOR UPDATE TO authenticated
  USING (auth.uid() = client_user_id)
  WITH CHECK (
    auth.uid() = client_user_id
    AND status IN ('in_progress', (SELECT status FROM support_tickets WHERE id = support_tickets.id))
    AND priority = (SELECT priority FROM support_tickets WHERE id = support_tickets.id)
  );
