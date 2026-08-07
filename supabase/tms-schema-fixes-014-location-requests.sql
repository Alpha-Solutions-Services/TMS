-- Dispatcher can request live GPS from a driver's phone; driver app fulfills automatically.
CREATE TABLE IF NOT EXISTS public.tms_location_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  load_id uuid REFERENCES public.dispatch_loads(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'fulfilled', 'expired', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  fulfilled_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

CREATE INDEX IF NOT EXISTS idx_tms_location_requests_driver_pending
  ON public.tms_location_requests (driver_profile_id, status, created_at DESC)
  WHERE status = 'pending';

ALTER TABLE public.tms_location_requests ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.tms_location_requests TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.tms_location_requests TO authenticated;
