-- Soft-purge rejected carrier docs after 7 days (file only; keep row + reason).
-- Additive. Apply once after review. Not applied yet.

ALTER TABLE public.tms_carrier_documents
  ALTER COLUMN file_path DROP NOT NULL;

ALTER TABLE public.tms_carrier_documents
  ADD COLUMN IF NOT EXISTS file_purged_at timestamptz;

COMMENT ON COLUMN public.tms_carrier_documents.file_purged_at IS
  'When the storage object was soft-purged after rejection retention. Row + rejection_reason kept.';

CREATE INDEX IF NOT EXISTS idx_tms_carrier_documents_purge_rejected
  ON public.tms_carrier_documents (reviewed_at)
  WHERE status = 'rejected'
    AND file_purged_at IS NULL
    AND file_path IS NOT NULL;
