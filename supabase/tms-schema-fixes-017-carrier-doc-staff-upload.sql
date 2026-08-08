-- Slice E: delegated staff upload of carrier documents.
-- Additive. Do NOT edit base schema files in place.
--
-- Adds attribution so four-eyes (E2) can be enforced: the staff member who
-- uploaded a document cannot approve/reject it. Carrier self-uploads keep
-- uploaded_by = NULL, so any super dispatcher may review them as before.

ALTER TABLE public.tms_carrier_documents
  ADD COLUMN IF NOT EXISTS uploaded_by uuid
    REFERENCES public.profiles (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.tms_carrier_documents.uploaded_by IS
  'Null = carrier self-upload. Staff upload (Slice E) sets profiles.id of uploader; that user cannot approve/reject the row (four-eyes).';

CREATE INDEX IF NOT EXISTS idx_tms_carrier_documents_uploaded_by
  ON public.tms_carrier_documents (uploaded_by)
  WHERE uploaded_by IS NOT NULL;
