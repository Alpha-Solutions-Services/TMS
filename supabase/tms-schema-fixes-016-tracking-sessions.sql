-- Multi-stop ZIPs on loads + assigned tracking sessions for live driver updates
ALTER TABLE public.dispatch_loads
  ADD COLUMN IF NOT EXISTS pickup_zips text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS delivery_zips text[] NOT NULL DEFAULT '{}';

CREATE TABLE IF NOT EXISTS public.tms_load_tracking_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.dispatch_loads(id) ON DELETE CASCADE,
  driver_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  assigned_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  carrier_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
  -- [{seq, kind: "pickup"|"delivery", zip, label?, lat?, lng?}]
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_tracking_sessions_active
  ON public.tms_load_tracking_sessions (status, driver_profile_id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_tms_tracking_sessions_load
  ON public.tms_load_tracking_sessions (load_id);

CREATE INDEX IF NOT EXISTS idx_tms_tracking_sessions_carrier
  ON public.tms_load_tracking_sessions (carrier_profile_id)
  WHERE status = 'active';

ALTER TABLE public.tms_load_tracking_sessions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.tms_load_tracking_sessions TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tms_load_tracking_sessions TO authenticated;
