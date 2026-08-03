-- Phase 1 (documents): carrier onboarding document storage.
-- Additive. Do NOT edit freight-schema.sql / tms-schema.sql in place.
-- Apply once on shared DB after review. Not applied yet.
--
-- Decisions locked (2026-08-02):
--   FK = profiles.id (carrier_profile_id)
--   documents = latest-wins UNIQUE (carrier_profile_id, document_type)
--   payment preference = profiles.carrier_payment_preference (factoring | quick_pay)
-- Subscription / carrier_paid_until is Phase 2 — not in this file.

-- ─── Payment preference (conditional NOA vs voided check) ───────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS carrier_payment_preference text;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_carrier_payment_preference_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_carrier_payment_preference_check
  CHECK (
    carrier_payment_preference IS NULL
    OR carrier_payment_preference IN ('factoring', 'quick_pay')
  );

COMMENT ON COLUMN public.profiles.carrier_payment_preference IS
  'Carrier pay preference at register: factoring → factoring_noa; quick_pay → voided_check.';

-- ─── Documents table ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tms_carrier_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  document_type text NOT NULL,
  file_path text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  reviewed_by uuid REFERENCES public.profiles (id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  CONSTRAINT tms_carrier_documents_type_check CHECK (
    document_type IN (
      'mc_authority',
      'w9',
      'coi',
      'factoring_noa',
      'voided_check'
    )
  ),
  CONSTRAINT tms_carrier_documents_status_check CHECK (
    status IN ('pending', 'approved', 'rejected')
  ),
  CONSTRAINT tms_carrier_documents_unique_type
    UNIQUE (carrier_profile_id, document_type)
);

CREATE INDEX IF NOT EXISTS idx_tms_carrier_documents_carrier
  ON public.tms_carrier_documents (carrier_profile_id);

CREATE INDEX IF NOT EXISTS idx_tms_carrier_documents_status
  ON public.tms_carrier_documents (status)
  WHERE status = 'pending';

COMMENT ON TABLE public.tms_carrier_documents IS
  'Latest carrier onboarding docs (MC authority, W-9, COI, NOA or voided check). Service-role uploads; signed URLs via API.';

-- ─── RLS (service role bypasses; JWT policies for future/direct reads) ───────
-- Carriers may only write pending rows with cleared review fields (no self-approve).
-- Super dispatcher may update any fields (approve/reject). Split UPDATE policies.
ALTER TABLE public.tms_carrier_documents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tms_carrier_documents_select_own ON public.tms_carrier_documents;
CREATE POLICY tms_carrier_documents_select_own
  ON public.tms_carrier_documents FOR SELECT TO authenticated
  USING (
    carrier_profile_id = auth.uid()
    OR public.tms_my_role() = 'super_dispatcher'
  );

DROP POLICY IF EXISTS tms_carrier_documents_insert_own ON public.tms_carrier_documents;
CREATE POLICY tms_carrier_documents_insert_own
  ON public.tms_carrier_documents FOR INSERT TO authenticated
  WITH CHECK (
    carrier_profile_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
  );

DROP POLICY IF EXISTS tms_carrier_documents_update_own ON public.tms_carrier_documents;
CREATE POLICY tms_carrier_documents_update_own
  ON public.tms_carrier_documents FOR UPDATE TO authenticated
  USING (carrier_profile_id = auth.uid())
  WITH CHECK (
    carrier_profile_id = auth.uid()
    AND status = 'pending'
    AND reviewed_by IS NULL
    AND reviewed_at IS NULL
    AND rejection_reason IS NULL
  );

DROP POLICY IF EXISTS tms_carrier_documents_update_super ON public.tms_carrier_documents;
CREATE POLICY tms_carrier_documents_update_super
  ON public.tms_carrier_documents FOR UPDATE TO authenticated
  USING (public.tms_my_role() = 'super_dispatcher')
  WITH CHECK (public.tms_my_role() = 'super_dispatcher');

-- ─── Private storage bucket (mirrors freight-load-documents) ─────────────────
-- No storage.objects policies: uploads/reads via service role + signed URLs.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'carrier-documents',
  'carrier-documents',
  false,
  10485760,
  ARRAY[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic'
  ]
)
ON CONFLICT (id) DO NOTHING;
