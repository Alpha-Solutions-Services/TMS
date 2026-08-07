-- Driver push subscriptions for live-location wake-ups (PWA)
CREATE TABLE IF NOT EXISTS public.tms_driver_push_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  p256dh text NOT NULL,
  auth text NOT NULL,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (endpoint)
);

CREATE INDEX IF NOT EXISTS idx_tms_driver_push_driver
  ON public.tms_driver_push_subscriptions (driver_profile_id);

ALTER TABLE public.tms_driver_push_subscriptions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON public.tms_driver_push_subscriptions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tms_driver_push_subscriptions TO authenticated;
