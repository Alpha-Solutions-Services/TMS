-- Carrier staff-initiated invites (7-day expiry). Additive. Apply once after review.
-- Not applied yet.

CREATE TABLE IF NOT EXISTS public.tms_carrier_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  invitee_name text,
  requires_documents boolean NOT NULL DEFAULT true,
  assigned_dispatcher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at timestamptz,
  accepted_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_carrier_invitations_token
  ON public.tms_carrier_invitations (token);
CREATE INDEX IF NOT EXISTS idx_tms_carrier_invitations_email
  ON public.tms_carrier_invitations (lower(invited_email));

ALTER TABLE public.tms_carrier_invitations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_carrier_invitations_service ON public.tms_carrier_invitations;
CREATE POLICY tms_carrier_invitations_service ON public.tms_carrier_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS carrier_documents_required boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.profiles.carrier_documents_required IS
  'When false (staff invite), onboarding uploads skipped; verify still manual (D2).';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assigned_dispatcher_id uuid
  REFERENCES public.profiles(id) ON DELETE SET NULL;
