-- Carrier fleet trucks + assign to driver (carrier + dispatcher manage via API/service role)

CREATE TABLE IF NOT EXISTS public.carrier_trucks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  truck_number text NOT NULL,
  equipment text DEFAULT 'Dry Van',
  trailer_number text,
  assigned_driver_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'Available',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carrier_trucks_number_unique UNIQUE (carrier_profile_id, truck_number)
);

CREATE INDEX IF NOT EXISTS carrier_trucks_carrier_idx
  ON public.carrier_trucks (carrier_profile_id);

CREATE INDEX IF NOT EXISTS carrier_trucks_driver_idx
  ON public.carrier_trucks (assigned_driver_profile_id);

COMMENT ON TABLE public.carrier_trucks IS
  'Carrier fleet units; assigned_driver_profile_id links a truck to a driver.';

ALTER TABLE public.carrier_trucks ENABLE ROW LEVEL SECURITY;

-- API uses service role; keep authenticated locked down
DROP POLICY IF EXISTS carrier_trucks_deny_all ON public.carrier_trucks;
CREATE POLICY carrier_trucks_deny_all
  ON public.carrier_trucks
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);
