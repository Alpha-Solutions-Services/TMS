-- TMS RLS security fixes
-- Run AFTER tms-schema.sql and tms-dispatcher-assignments.sql
-- Replaces overly-permissive dispatcher policies with role-scoped access.

-- ─── Helper: role checks ─────────────────────────────────────────────────────

-- Super dispatchers have full TMS access (stored in tms_users.role).
CREATE OR REPLACE FUNCTION tms_is_super_dispatcher()
RETURNS BOOLEAN AS $$
  SELECT tms_my_role() = 'super_dispatcher';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Middle-tier dispatcher (not sub).
CREATE OR REPLACE FUNCTION tms_is_full_dispatcher()
RETURNS BOOLEAN AS $$
  SELECT tms_my_role() = 'dispatcher';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION tms_is_sub_dispatcher()
RETURNS BOOLEAN AS $$
  SELECT tms_my_role() = 'sub_dispatcher';
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Any dispatch-team role (legacy helper extended for middle tier).
CREATE OR REPLACE FUNCTION tms_is_dispatch_team()
RETURNS BOOLEAN AS $$
  SELECT tms_my_role() IN ('super_dispatcher', 'dispatcher', 'sub_dispatcher');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Assignment: profiles.assigned_dispatcher_id (portal carriers) ─────────
-- Maps tms_carriers.id → carrier auth profile → assigned_dispatcher_id.

-- Returns true when the current dispatcher is assigned to the given TMS carrier row.
CREATE OR REPLACE FUNCTION tms_dispatcher_assigned_to_carrier(p_carrier_id UUID)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p_carrier_id IS NULL THEN FALSE
    WHEN tms_is_super_dispatcher() THEN TRUE
    ELSE EXISTS (
      SELECT 1
      FROM tms_users tu
      INNER JOIN profiles p ON p.id = tu.id AND p.role = 'carrier'
      WHERE tu.carrier_id = p_carrier_id
        AND p.assigned_dispatcher_id = auth.uid()
    )
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Returns true when the current dispatcher is assigned to a portal carrier profile id.
CREATE OR REPLACE FUNCTION tms_dispatcher_assigned_to_profile(p_profile_id UUID)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p_profile_id IS NULL THEN FALSE
    WHEN tms_is_super_dispatcher() THEN TRUE
    ELSE EXISTS (
      SELECT 1
      FROM profiles p
      WHERE p.id = p_profile_id
        AND p.role = 'carrier'
        AND p.assigned_dispatcher_id = auth.uid()
    )
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Driver roster assignment (dispatch_driver_roster.assigned_dispatcher_id).
CREATE OR REPLACE FUNCTION tms_dispatcher_assigned_to_driver_roster(p_driver_email TEXT)
RETURNS BOOLEAN AS $$
  SELECT CASE
    WHEN p_driver_email IS NULL OR trim(p_driver_email) = '' THEN FALSE
    WHEN tms_is_super_dispatcher() THEN TRUE
    ELSE EXISTS (
      SELECT 1
      FROM dispatch_driver_roster r
      WHERE r.active IS NOT FALSE
        AND lower(trim(r.driver_email)) = lower(trim(p_driver_email))
        AND r.assigned_dispatcher_id = auth.uid()
    )
  END;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Can the current user see this load? Used by events + dispatcher SELECT policies.
CREATE OR REPLACE FUNCTION tms_user_can_access_load(p_load_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1
    FROM tms_loads l
    WHERE l.id = p_load_id
      AND (
        -- Super: all loads
        tms_is_super_dispatcher()
        -- Full dispatcher: assigned carrier loads or own created loads
        OR (
          tms_is_full_dispatcher()
          AND (
            tms_dispatcher_assigned_to_carrier(l.carrier_id)
            OR l.created_by = auth.uid()
          )
        )
        -- Sub dispatcher: same visibility, writes restricted elsewhere
        OR (
          tms_is_sub_dispatcher()
          AND (
            tms_dispatcher_assigned_to_carrier(l.carrier_id)
            OR l.created_by = auth.uid()
          )
        )
        -- Carrier: own carrier's loads
        OR (
          tms_my_role() = 'carrier'
          AND l.carrier_id IN (
            SELECT carrier_id FROM tms_users WHERE id = auth.uid()
          )
        )
        -- Driver: loads assigned to them
        OR (
          tms_my_role() = 'driver'
          AND l.driver_id IN (
            SELECT d.id
            FROM tms_drivers d
            WHERE d.user_id = auth.uid()
          )
        )
      )
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ─── Drop legacy permissive policies ─────────────────────────────────────────

DROP POLICY IF EXISTS tms_loads_dispatcher_all ON tms_loads;
DROP POLICY IF EXISTS tms_events_read ON tms_load_events;
DROP POLICY IF EXISTS tms_events_insert ON tms_load_events;
DROP POLICY IF EXISTS tms_carriers_read ON tms_carriers;
DROP POLICY IF EXISTS tms_drivers_read ON tms_drivers;

-- ─── tms_loads: split by role ────────────────────────────────────────────────

-- Super dispatchers retain full CRUD on all loads.
CREATE POLICY tms_loads_super_all ON tms_loads
  FOR ALL TO authenticated
  USING (tms_is_super_dispatcher())
  WITH CHECK (tms_is_super_dispatcher());

-- Full dispatchers: CRUD only on loads for assigned carriers (or loads they created).
CREATE POLICY tms_loads_dispatcher_select ON tms_loads
  FOR SELECT TO authenticated
  USING (
    tms_is_full_dispatcher()
    AND (
      tms_dispatcher_assigned_to_carrier(carrier_id)
      OR created_by = auth.uid()
    )
  );

CREATE POLICY tms_loads_dispatcher_insert ON tms_loads
  FOR INSERT TO authenticated
  WITH CHECK (
    tms_is_full_dispatcher()
    AND (
      carrier_id IS NULL
      OR tms_dispatcher_assigned_to_carrier(carrier_id)
    )
  );

CREATE POLICY tms_loads_dispatcher_update ON tms_loads
  FOR UPDATE TO authenticated
  USING (
    tms_is_full_dispatcher()
    AND (
      tms_dispatcher_assigned_to_carrier(carrier_id)
      OR created_by = auth.uid()
    )
  )
  WITH CHECK (
    tms_is_full_dispatcher()
    AND (
      tms_dispatcher_assigned_to_carrier(carrier_id)
      OR created_by = auth.uid()
    )
  );

CREATE POLICY tms_loads_dispatcher_delete ON tms_loads
  FOR DELETE TO authenticated
  USING (
    tms_is_full_dispatcher()
    AND (
      tms_dispatcher_assigned_to_carrier(carrier_id)
      OR created_by = auth.uid()
    )
  );

-- Sub dispatchers: read assigned loads; new loads must enter approval queue.
CREATE POLICY tms_loads_sub_select ON tms_loads
  FOR SELECT TO authenticated
  USING (
    tms_is_sub_dispatcher()
    AND (
      tms_dispatcher_assigned_to_carrier(carrier_id)
      OR created_by = auth.uid()
    )
  );

-- Sub dispatchers cannot publish loads directly — INSERT must be pending_approval.
CREATE POLICY tms_loads_sub_insert ON tms_loads
  FOR INSERT TO authenticated
  WITH CHECK (
    tms_is_sub_dispatcher()
    AND status = 'pending_approval'
    AND (
      carrier_id IS NULL
      OR tms_dispatcher_assigned_to_carrier(carrier_id)
    )
  );

-- Sub dispatchers may only edit draft loads they own; live loads go through tms_load_approvals.
CREATE POLICY tms_loads_sub_update_draft ON tms_loads
  FOR UPDATE TO authenticated
  USING (
    tms_is_sub_dispatcher()
    AND status = 'draft'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    tms_is_sub_dispatcher()
    AND status = 'draft'
    AND created_by = auth.uid()
  );

CREATE POLICY tms_loads_sub_delete_draft ON tms_loads
  FOR DELETE TO authenticated
  USING (
    tms_is_sub_dispatcher()
    AND status = 'draft'
    AND created_by = auth.uid()
  );

-- ─── tms_load_events: require parent load access ─────────────────────────────

-- SELECT: requester must actually have access to the parent load (not merely authenticated).
CREATE POLICY tms_events_read ON tms_load_events
  FOR SELECT TO authenticated
  USING (tms_user_can_access_load(load_id));

-- INSERT: dispatch team for accessible loads; carriers/drivers only on their own loads.
CREATE POLICY tms_events_insert ON tms_load_events
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      tms_is_dispatch_team()
      AND tms_user_can_access_load(load_id)
    )
    OR (
      tms_my_role() = 'carrier'
      AND load_id IN (
        SELECT l.id
        FROM tms_loads l
        WHERE l.carrier_id IN (
          SELECT carrier_id FROM tms_users WHERE id = auth.uid()
        )
      )
    )
    OR (
      tms_my_role() = 'driver'
      AND load_id IN (
        SELECT l.id
        FROM tms_loads l
        WHERE l.driver_id IN (
          SELECT d.id FROM tms_drivers d WHERE d.user_id = auth.uid()
        )
      )
    )
  );

-- ─── Contact masking: SECURITY DEFINER RPCs ──────────────────────────────────
-- Prevents non-super roles from pulling contact_email/contact_phone via raw SELECT.

CREATE OR REPLACE FUNCTION tms_list_carriers_masked()
RETURNS TABLE (
  id UUID,
  company_name TEXT,
  mc_number TEXT,
  dot_number TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    c.id,
    c.company_name,
    c.mc_number,
    c.dot_number,
    CASE WHEN tms_is_super_dispatcher() THEN c.contact_email ELSE NULL END,
    CASE WHEN tms_is_super_dispatcher() THEN c.contact_phone ELSE NULL END,
    c.active,
    c.created_at
  FROM tms_carriers c
  WHERE
    tms_is_super_dispatcher()
    OR (
      tms_is_dispatch_team()
      AND tms_dispatcher_assigned_to_carrier(c.id)
    )
    OR c.id IN (SELECT carrier_id FROM tms_users WHERE id = auth.uid());
$$;

CREATE OR REPLACE FUNCTION tms_list_drivers_masked()
RETURNS TABLE (
  id UUID,
  user_id UUID,
  carrier_id UUID,
  full_name TEXT,
  phone TEXT,
  license_number TEXT,
  active BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT
    d.id,
    d.user_id,
    d.carrier_id,
    d.full_name,
    CASE WHEN tms_is_super_dispatcher() THEN d.phone ELSE NULL END,
    d.license_number,
    d.active,
    d.created_at
  FROM tms_drivers d
  WHERE
    tms_is_super_dispatcher()
    OR (
      tms_is_dispatch_team()
      AND tms_dispatcher_assigned_to_carrier(d.carrier_id)
    )
    OR d.carrier_id IN (SELECT carrier_id FROM tms_users WHERE id = auth.uid())
    OR d.user_id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION tms_list_carriers_masked() TO authenticated;
GRANT EXECUTE ON FUNCTION tms_list_drivers_masked() TO authenticated;

-- Block direct table reads that expose contact columns to non-super dispatch team.
-- Supers and service role retain direct access; dispatch team must use RPCs above.
CREATE POLICY tms_carriers_read_super ON tms_carriers
  FOR SELECT TO authenticated
  USING (tms_is_super_dispatcher());

CREATE POLICY tms_carriers_read_own ON tms_carriers
  FOR SELECT TO authenticated
  USING (
    id IN (SELECT carrier_id FROM tms_users WHERE id = auth.uid())
  );

CREATE POLICY tms_drivers_read_super ON tms_drivers
  FOR SELECT TO authenticated
  USING (tms_is_super_dispatcher());

CREATE POLICY tms_drivers_read_own ON tms_drivers
  FOR SELECT TO authenticated
  USING (
    carrier_id IN (SELECT carrier_id FROM tms_users WHERE id = auth.uid())
    OR user_id = auth.uid()
  );

-- ─── tms_load_approvals: sub dispatchers submit; supers review ───────────────

DROP POLICY IF EXISTS tms_approvals_dispatcher ON tms_load_approvals;

CREATE POLICY tms_approvals_super_all ON tms_load_approvals
  FOR ALL TO authenticated
  USING (tms_is_super_dispatcher())
  WITH CHECK (tms_is_super_dispatcher());

CREATE POLICY tms_approvals_sub_insert ON tms_load_approvals
  FOR INSERT TO authenticated
  WITH CHECK (
    tms_is_sub_dispatcher()
    AND requested_by = auth.uid()
  );

CREATE POLICY tms_approvals_sub_select ON tms_load_approvals
  FOR SELECT TO authenticated
  USING (
    tms_is_sub_dispatcher()
    AND requested_by = auth.uid()
  );

-- ─── Audit trigger: log direct DB writes to tms_loads ──────────────────────────

CREATE OR REPLACE FUNCTION tms_audit_load_change()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO freight_action_log (actor_id, actor_email, action, entity_type, entity_id, meta)
  VALUES (
    auth.uid(),
    (SELECT email FROM tms_users WHERE id = auth.uid() LIMIT 1),
    CASE TG_OP
      WHEN 'INSERT' THEN 'load.create'
      WHEN 'UPDATE' THEN 'load.update'
      WHEN 'DELETE' THEN 'load.delete'
    END,
    'tms_load',
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object(
      'source', 'db_trigger',
      'op', TG_OP,
      'status', COALESCE(NEW.status, OLD.status),
      'carrier_id', COALESCE(NEW.carrier_id, OLD.carrier_id)
    )
  );
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS tms_loads_audit_trigger ON tms_loads;
CREATE TRIGGER tms_loads_audit_trigger
  AFTER INSERT OR UPDATE OR DELETE ON tms_loads
  FOR EACH ROW EXECUTE FUNCTION tms_audit_load_change();
