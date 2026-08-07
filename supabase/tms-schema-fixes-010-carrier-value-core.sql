-- Carrier value core (Phase 1) + schema stubs for remaining features.
-- Additive. Clean tms_* naming for humans + Ask Alpha.

-- 1) Public load share / tracking links
CREATE TABLE IF NOT EXISTS public.tms_load_share_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.dispatch_loads(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  zip_last4 text NOT NULL CHECK (zip_last4 ~ '^[0-9]{4}$'),
  label text,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  revoked_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_load_share_links_token
  ON public.tms_load_share_links (token);
CREATE INDEX IF NOT EXISTS idx_tms_load_share_links_load
  ON public.tms_load_share_links (load_id);

ALTER TABLE public.tms_load_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_load_share_links_service ON public.tms_load_share_links;
CREATE POLICY tms_load_share_links_service ON public.tms_load_share_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tms_load_share_links IS
  'Public Live Share style tracking links. Access only via tms_public_load_track RPC.';

-- Secure public track RPC (no broad anon SELECT on dispatch_loads)
CREATE OR REPLACE FUNCTION public.tms_public_load_track(p_token text, p_zip text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_link public.tms_load_share_links%ROWTYPE;
  v_load public.dispatch_loads%ROWTYPE;
  v_zip4 text;
BEGIN
  IF p_token IS NULL OR length(trim(p_token)) < 16 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  v_zip4 := right(regexp_replace(coalesce(p_zip, ''), '[^0-9]', '', 'g'), 4);
  IF length(v_zip4) <> 4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_zip');
  END IF;

  SELECT * INTO v_link
  FROM public.tms_load_share_links
  WHERE token = trim(p_token)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  IF v_link.revoked_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'revoked');
  END IF;

  IF v_link.expires_at < now() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  IF v_link.zip_last4 <> v_zip4 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'zip_mismatch');
  END IF;

  SELECT * INTO v_load
  FROM public.dispatch_loads
  WHERE id = v_link.load_id AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'load_missing');
  END IF;

  -- Sanitized payload only — no rate, email, phone, notes
  RETURN jsonb_build_object(
    'ok', true,
    'load', jsonb_build_object(
      'loadNumber', coalesce(v_load.load_number, ''),
      'status', coalesce(v_load.status, ''),
      'pickup', coalesce(v_load.pickup_date_time, ''),
      'delivery', coalesce(v_load.delivery_date_time, ''),
      'lane', coalesce(v_load.states, ''),
      'equipment', coalesce(v_load.truck_trailer, ''),
      'carrierName', coalesce(v_load.company_name, '')
    ),
    'expiresAt', v_link.expires_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tms_public_load_track(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.tms_public_load_track(text, text) TO anon, authenticated, service_role;

-- 2) Per-load rate confirmation e-sign
CREATE TABLE IF NOT EXISTS public.tms_rate_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid NOT NULL REFERENCES public.dispatch_loads(id) ON DELETE CASCADE,
  carrier_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  terms_version text NOT NULL DEFAULT 'rc-v1-2026-08',
  rate_amount numeric(12,2) NOT NULL DEFAULT 0,
  dispatch_percent numeric(6,2),
  load_number text,
  broker text,
  lane text,
  company_name text,
  contact_name text,
  signer_email text,
  signer_phone text,
  accepted_at timestamptz,
  accepted_ip text,
  accepted_user_agent text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_rate_confirmations_token
  ON public.tms_rate_confirmations (token);
CREATE INDEX IF NOT EXISTS idx_tms_rate_confirmations_load
  ON public.tms_rate_confirmations (load_id);
CREATE INDEX IF NOT EXISTS idx_tms_rate_confirmations_status
  ON public.tms_rate_confirmations (status);

ALTER TABLE public.tms_rate_confirmations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_rate_confirmations_service ON public.tms_rate_confirmations;
CREATE POLICY tms_rate_confirmations_service ON public.tms_rate_confirmations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tms_rate_confirmations IS
  'Per-load rate confirmation e-sign. Mirrors tms_carrier_agreements pattern.';

-- 3) POD/OCR extractions stub
CREATE TABLE IF NOT EXISTS public.tms_document_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid REFERENCES public.dispatch_loads(id) ON DELETE CASCADE,
  carrier_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_type text NOT NULL CHECK (document_type IN ('pod', 'bol', 'rc', 'other')),
  storage_path text,
  extracted jsonb NOT NULL DEFAULT '{}'::jsonb,
  model text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_document_extractions_load
  ON public.tms_document_extractions (load_id);

ALTER TABLE public.tms_document_extractions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_document_extractions_service ON public.tms_document_extractions;
CREATE POLICY tms_document_extractions_service ON public.tms_document_extractions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.tms_document_extractions IS
  'Groq/OCR extraction results. Prefer typed keys in extracted jsonb (delivery_date, consignee, seal, raw_text).';

-- 4) Referrals stub
CREATE TABLE IF NOT EXISTS public.tms_referrals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code text NOT NULL UNIQUE,
  invitee_email text,
  invitee_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'registered', 'rewarded', 'cancelled')),
  reward_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tms_referrals_code ON public.tms_referrals (code);

ALTER TABLE public.tms_referrals ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_referrals_service ON public.tms_referrals;
CREATE POLICY tms_referrals_service ON public.tms_referrals
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Announcements
CREATE TABLE IF NOT EXISTS public.tms_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  body text NOT NULL,
  audience text NOT NULL DEFAULT 'carrier'
    CHECK (audience IN ('carrier', 'dispatcher', 'all')),
  starts_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tms_announcements_active
  ON public.tms_announcements (starts_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.tms_announcements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_announcements_service ON public.tms_announcements;
CREATE POLICY tms_announcements_service ON public.tms_announcements
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 6) Compliance expiry columns on profiles (additive)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS insurance_expires_at date,
  ADD COLUMN IF NOT EXISTS ifta_due_at date,
  ADD COLUMN IF NOT EXISTS registration_expires_at date;

COMMENT ON COLUMN public.profiles.insurance_expires_at IS
  'Carrier COI expiry for reminder cron.';
COMMENT ON COLUMN public.profiles.ifta_due_at IS
  'Next IFTA due date for reminder cron.';
COMMENT ON COLUMN public.profiles.registration_expires_at IS
  'Registration/authority expiry for reminder cron.';

-- 7) Community feed stubs
CREATE TABLE IF NOT EXISTS public.tms_community_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tms_community_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.tms_community_posts(id) ON DELETE CASCADE,
  author_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

ALTER TABLE public.tms_community_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tms_community_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_community_posts_service ON public.tms_community_posts;
CREATE POLICY tms_community_posts_service ON public.tms_community_posts
  FOR ALL TO service_role USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS tms_community_comments_service ON public.tms_community_comments;
CREATE POLICY tms_community_comments_service ON public.tms_community_comments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 8) Lumper / advance requests
CREATE TABLE IF NOT EXISTS public.tms_advance_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id uuid REFERENCES public.dispatch_loads(id) ON DELETE SET NULL,
  carrier_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN ('lumper', 'advance')),
  amount numeric(12,2) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'denied', 'paid')),
  carrier_note text,
  dispatcher_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  decided_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  decided_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_tms_advance_requests_carrier
  ON public.tms_advance_requests (carrier_profile_id, status);

ALTER TABLE public.tms_advance_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tms_advance_requests_service ON public.tms_advance_requests;
CREATE POLICY tms_advance_requests_service ON public.tms_advance_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- AI-safe views (no tokens / secrets)
CREATE OR REPLACE VIEW public.tms_ai_carrier_scorecard
WITH (security_invoker = true)
AS
SELECT
  p.id AS carrier_profile_id,
  coalesce(p.company_name, p.full_name, 'Carrier') AS carrier_name,
  count(l.id) FILTER (WHERE l.deleted_at IS NULL) AS load_count,
  count(l.id) FILTER (
    WHERE l.deleted_at IS NULL
      AND lower(coalesce(l.status, '')) IN ('delivered', 'paid', 'complete', 'completed')
  ) AS delivered_count,
  round(
    avg(l.dispatch_percent) FILTER (WHERE l.deleted_at IS NULL AND l.dispatch_percent > 0),
    2
  ) AS avg_dispatch_percent
FROM public.profiles p
LEFT JOIN public.dispatch_loads l
  ON l.carrier_profile_id = p.id OR lower(l.company_name) = lower(coalesce(p.company_name, ''))
WHERE p.role = 'carrier'
GROUP BY p.id, p.company_name, p.full_name;

CREATE OR REPLACE VIEW public.tms_ai_active_announcements
WITH (security_invoker = true)
AS
SELECT id, title, left(body, 200) AS body_preview, audience, starts_at, ends_at
FROM public.tms_announcements
WHERE deleted_at IS NULL
  AND starts_at <= now()
  AND (ends_at IS NULL OR ends_at >= now())
ORDER BY starts_at DESC;

CREATE OR REPLACE VIEW public.tms_ai_open_advances
WITH (security_invoker = true)
AS
SELECT
  id,
  load_id,
  carrier_profile_id,
  request_type,
  amount,
  status,
  created_at
FROM public.tms_advance_requests
WHERE status IN ('pending', 'approved');

REVOKE ALL ON public.tms_ai_carrier_scorecard FROM PUBLIC;
REVOKE ALL ON public.tms_ai_active_announcements FROM PUBLIC;
REVOKE ALL ON public.tms_ai_open_advances FROM PUBLIC;
GRANT SELECT ON public.tms_ai_carrier_scorecard TO service_role;
GRANT SELECT ON public.tms_ai_active_announcements TO service_role;
GRANT SELECT ON public.tms_ai_open_advances TO service_role;
