-- Carrier all-in-one business ops: fleet fields, expenses, fuel, settlements meta

ALTER TABLE public.carrier_trucks
  ADD COLUMN IF NOT EXISTS truck_type text DEFAULT 'Dry Van',
  ADD COLUMN IF NOT EXISTS vin text,
  ADD COLUMN IF NOT EXISTS license_plate text,
  ADD COLUMN IF NOT EXISTS home_base text,
  ADD COLUMN IF NOT EXISTS notes text;

-- Categorized operating expenses (factoring, insurance, truck payments, etc.)
CREATE TABLE IF NOT EXISTS public.carrier_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  category text NOT NULL,
  label text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  expense_date date NOT NULL DEFAULT CURRENT_DATE,
  week_of date,
  truck_id uuid REFERENCES public.carrier_trucks(id) ON DELETE SET NULL,
  driver_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  load_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carrier_expenses_carrier_idx
  ON public.carrier_expenses (carrier_profile_id, expense_date DESC);
CREATE INDEX IF NOT EXISTS carrier_expenses_category_idx
  ON public.carrier_expenses (carrier_profile_id, category);

COMMENT ON TABLE public.carrier_expenses IS
  'Carrier operating expenses: factoring, dispatch, insurance, truck/trailer payments, etc.';

-- Fuel fill-ups / usage
CREATE TABLE IF NOT EXISTS public.carrier_fuel_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  log_date date NOT NULL DEFAULT CURRENT_DATE,
  truck_id uuid REFERENCES public.carrier_trucks(id) ON DELETE SET NULL,
  driver_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  location text,
  gallons numeric(10,3) NOT NULL DEFAULT 0,
  cost numeric(12,2) NOT NULL DEFAULT 0,
  odometer numeric(12,1),
  mpg numeric(8,2),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS carrier_fuel_logs_carrier_idx
  ON public.carrier_fuel_logs (carrier_profile_id, log_date DESC);
CREATE INDEX IF NOT EXISTS carrier_fuel_logs_truck_idx
  ON public.carrier_fuel_logs (truck_id, log_date DESC);

COMMENT ON TABLE public.carrier_fuel_logs IS
  'Fuel purchases and usage; MPG can be stored or derived from odometer deltas.';

-- Settlement / AR overlay on loads (broker invoices the carrier is chasing)
CREATE TABLE IF NOT EXISTS public.carrier_settlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  load_id uuid,
  invoice_number text,
  broker text,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  invoice_date date,
  due_date date,
  status text NOT NULL DEFAULT 'Unpaid',
  payment_date date,
  balance numeric(12,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS carrier_settlements_load_unique
  ON public.carrier_settlements (carrier_profile_id, load_id)
  WHERE load_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS carrier_settlements_carrier_idx
  ON public.carrier_settlements (carrier_profile_id, status);

ALTER TABLE public.carrier_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_fuel_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carrier_settlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carrier_expenses_deny_all ON public.carrier_expenses;
CREATE POLICY carrier_expenses_deny_all
  ON public.carrier_expenses FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS carrier_fuel_logs_deny_all ON public.carrier_fuel_logs;
CREATE POLICY carrier_fuel_logs_deny_all
  ON public.carrier_fuel_logs FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

DROP POLICY IF EXISTS carrier_settlements_deny_all ON public.carrier_settlements;
CREATE POLICY carrier_settlements_deny_all
  ON public.carrier_settlements FOR ALL TO authenticated
  USING (false) WITH CHECK (false);
