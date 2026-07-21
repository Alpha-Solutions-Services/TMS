-- Alpha Freight Network TMS schema (same Supabase project as Portal)
-- Run once in Supabase SQL Editor

-- Roles enum
DO $$ BEGIN
  CREATE TYPE tms_role AS ENUM (
    'super_dispatcher',
    'sub_dispatcher',
    'carrier',
    'driver'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tms_load_status AS ENUM (
    'draft',
    'pending_approval',
    'available',
    'assigned',
    'dispatched',
    'in_transit',
    'delivered',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE tms_approval_status AS ENUM (
    'pending',
    'approved',
    'rejected'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Users (extends auth.users)
CREATE TABLE IF NOT EXISTS tms_users (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT NOT NULL,
  full_name   TEXT,
  role        tms_role NOT NULL DEFAULT 'sub_dispatcher',
  carrier_id  UUID,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tms_users_email_idx ON tms_users (lower(email));
CREATE INDEX IF NOT EXISTS tms_users_role_idx ON tms_users (role);

-- Carriers
CREATE TABLE IF NOT EXISTS tms_carriers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name TEXT NOT NULL,
  mc_number   TEXT,
  dot_number  TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE tms_users
  DROP CONSTRAINT IF EXISTS tms_users_carrier_id_fkey;
ALTER TABLE tms_users
  ADD CONSTRAINT tms_users_carrier_id_fkey
  FOREIGN KEY (carrier_id) REFERENCES tms_carriers(id) ON DELETE SET NULL;

-- Drivers
CREATE TABLE IF NOT EXISTS tms_drivers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES tms_users(id) ON DELETE SET NULL,
  carrier_id  UUID REFERENCES tms_carriers(id) ON DELETE SET NULL,
  full_name   TEXT NOT NULL,
  phone       TEXT,
  license_number TEXT,
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Loads
CREATE TABLE IF NOT EXISTS tms_loads (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_number     TEXT UNIQUE,
  origin_city     TEXT NOT NULL,
  origin_state    TEXT NOT NULL,
  destination_city TEXT NOT NULL,
  destination_state TEXT NOT NULL,
  pickup_date     DATE,
  delivery_date   DATE,
  equipment_type  TEXT,
  weight_lbs      NUMERIC,
  rate            NUMERIC,
  notes           TEXT,
  status          tms_load_status NOT NULL DEFAULT 'draft',
  carrier_id      UUID REFERENCES tms_carriers(id) ON DELETE SET NULL,
  driver_id       UUID REFERENCES tms_drivers(id) ON DELETE SET NULL,
  created_by      UUID REFERENCES tms_users(id) ON DELETE SET NULL,
  approved_by     UUID REFERENCES tms_users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tms_loads_status_idx ON tms_loads (status);
CREATE INDEX IF NOT EXISTS tms_loads_created_by_idx ON tms_loads (created_by);

-- Approval queue (sub dispatcher edits/additions)
CREATE TABLE IF NOT EXISTS tms_load_approvals (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id       UUID REFERENCES tms_loads(id) ON DELETE CASCADE,
  action        TEXT NOT NULL CHECK (action IN ('create', 'edit', 'cancel')),
  payload       JSONB NOT NULL DEFAULT '{}',
  status        tms_approval_status NOT NULL DEFAULT 'pending',
  requested_by  UUID REFERENCES tms_users(id) ON DELETE SET NULL,
  reviewed_by   UUID REFERENCES tms_users(id) ON DELETE SET NULL,
  review_note   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at   TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS tms_load_approvals_status_idx ON tms_load_approvals (status);

-- Load event timeline
CREATE TABLE IF NOT EXISTS tms_load_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id     UUID NOT NULL REFERENCES tms_loads(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  note        TEXT,
  created_by  UUID REFERENCES tms_users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-generate load number
CREATE OR REPLACE FUNCTION tms_generate_load_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.load_number IS NULL THEN
    NEW.load_number := 'AFN-' || to_char(now(), 'YYMMDD') || '-' ||
      lpad(floor(random() * 10000)::text, 4, '0');
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tms_loads_before_insert ON tms_loads;
CREATE TRIGGER tms_loads_before_insert
  BEFORE INSERT OR UPDATE ON tms_loads
  FOR EACH ROW EXECUTE FUNCTION tms_generate_load_number();

-- RLS
ALTER TABLE tms_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_carriers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_load_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE tms_load_events ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's TMS role
CREATE OR REPLACE FUNCTION tms_my_role()
RETURNS tms_role AS $$
  SELECT role FROM tms_users WHERE id = auth.uid() AND active = true;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION tms_is_dispatcher()
RETURNS BOOLEAN AS $$
  SELECT tms_my_role() IN ('super_dispatcher', 'sub_dispatcher');
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- tms_users policies
CREATE POLICY tms_users_select ON tms_users FOR SELECT TO authenticated
  USING (id = auth.uid() OR tms_my_role() = 'super_dispatcher');

CREATE POLICY tms_users_update ON tms_users FOR UPDATE TO authenticated
  USING (tms_my_role() = 'super_dispatcher');

-- tms_loads policies
CREATE POLICY tms_loads_dispatcher_all ON tms_loads FOR ALL TO authenticated
  USING (tms_is_dispatcher()) WITH CHECK (tms_is_dispatcher());

CREATE POLICY tms_loads_carrier_select ON tms_loads FOR SELECT TO authenticated
  USING (
    tms_my_role() = 'carrier' AND carrier_id IN (
      SELECT carrier_id FROM tms_users WHERE id = auth.uid()
    )
  );

CREATE POLICY tms_loads_driver_select ON tms_loads FOR SELECT TO authenticated
  USING (
    tms_my_role() = 'driver' AND driver_id IN (
      SELECT d.id FROM tms_drivers d
      JOIN tms_users u ON u.id = auth.uid()
      WHERE d.user_id = u.id OR d.id = (
        SELECT driver_id FROM tms_users WHERE id = auth.uid()
      )
    )
  );

-- tms_load_approvals policies
CREATE POLICY tms_approvals_dispatcher ON tms_load_approvals FOR ALL TO authenticated
  USING (tms_is_dispatcher()) WITH CHECK (tms_is_dispatcher());

-- tms_carriers / drivers read for dispatchers + own carrier
CREATE POLICY tms_carriers_read ON tms_carriers FOR SELECT TO authenticated
  USING (tms_is_dispatcher() OR id IN (SELECT carrier_id FROM tms_users WHERE id = auth.uid()));

CREATE POLICY tms_drivers_read ON tms_drivers FOR SELECT TO authenticated
  USING (
    tms_is_dispatcher()
    OR carrier_id IN (SELECT carrier_id FROM tms_users WHERE id = auth.uid())
    OR user_id = auth.uid()
  );

CREATE POLICY tms_events_read ON tms_load_events FOR SELECT TO authenticated
  USING (
    load_id IN (SELECT id FROM tms_loads)
  );

CREATE POLICY tms_events_insert ON tms_load_events FOR INSERT TO authenticated
  WITH CHECK (tms_is_dispatcher() OR tms_my_role() IN ('carrier', 'driver'));
