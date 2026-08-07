-- Driver ops: GPS locations, driver_status, driver pay %
-- Additive for TMS driver tracking + settlement (Excel-style Driver Pay %).

CREATE TABLE IF NOT EXISTS public.tms_driver_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  load_id uuid REFERENCES public.dispatch_loads(id) ON DELETE SET NULL,
  lat double precision NOT NULL,
  lng double precision NOT NULL,
  accuracy_m double precision,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (driver_profile_id)
);

CREATE INDEX IF NOT EXISTS idx_tms_driver_locations_updated
  ON public.tms_driver_locations (updated_at DESC);

ALTER TABLE public.tms_driver_locations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_driver_locations_service ON public.tms_driver_locations;
CREATE POLICY tms_driver_locations_service ON public.tms_driver_locations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tms_driver_locations IS
  'Latest GPS ping per driver for dispatcher tracking map/list.';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS driver_status text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS default_driver_pay_percent numeric(5,2);

DO $$ BEGIN
  ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS profiles_driver_status_check;
  ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_driver_status_check
    CHECK (driver_status IS NULL OR driver_status IN ('active', 'suspended', 'terminated'));
EXCEPTION WHEN others THEN NULL;
END $$;

COMMENT ON COLUMN public.profiles.driver_status IS
  'Driver lifecycle: active | suspended | terminated';
COMMENT ON COLUMN public.profiles.default_driver_pay_percent IS
  'Default % of load rate paid to driver (Excel-style Driver Pay %).';

ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS driver_pay_percent numeric(5,2);

COMMENT ON COLUMN public.dispatch_loads.driver_pay_percent IS
  'Per-load driver settlement % of rc_invoice (overrides profile default).';
