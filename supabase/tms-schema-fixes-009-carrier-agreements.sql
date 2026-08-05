-- Carrier dispatch service agreements (e-sign → invite only). Additive.
-- Applied via Supabase MCP as tms_carrier_agreements.

CREATE TABLE IF NOT EXISTS public.tms_carrier_agreements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  assigned_dispatcher_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_email text,
  dispatch_percent numeric(6,2) NOT NULL
    CHECK (dispatch_percent >= 2 AND dispatch_percent <= 100),
  requires_documents boolean NOT NULL DEFAULT true,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  terms_version text NOT NULL,
  company_name text,
  contact_name text,
  carrier_email text,
  carrier_phone text,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_user_agent text,
  invitation_id uuid REFERENCES public.tms_carrier_invitations(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_carrier_agreements_token
  ON public.tms_carrier_agreements (token);
CREATE INDEX IF NOT EXISTS idx_tms_carrier_agreements_status
  ON public.tms_carrier_agreements (status);
CREATE INDEX IF NOT EXISTS idx_tms_carrier_agreements_email
  ON public.tms_carrier_agreements (lower(carrier_email));
CREATE INDEX IF NOT EXISTS idx_tms_carrier_agreements_company
  ON public.tms_carrier_agreements (lower(company_name));

ALTER TABLE public.tms_carrier_agreements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_carrier_agreements_service ON public.tms_carrier_agreements;
CREATE POLICY tms_carrier_agreements_service ON public.tms_carrier_agreements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_dispatch_percent numeric(6,2)
  CHECK (default_dispatch_percent IS NULL OR (default_dispatch_percent >= 2 AND default_dispatch_percent <= 100));

COMMENT ON COLUMN public.profiles.default_dispatch_percent IS
  'Default dispatch % from accepted carrier agreement; used to autofill new loads.';

COMMENT ON TABLE public.tms_carrier_agreements IS
  'Carrier e-sign agreements. Dispatcher sets %; carrier fills company/name/email/phone; accept creates invite only.';
