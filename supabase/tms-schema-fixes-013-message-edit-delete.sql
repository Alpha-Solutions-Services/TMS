-- Soft edit/delete for freight chat messages
ALTER TABLE public.dispatch_carrier_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

ALTER TABLE public.freight_thread_messages
  ADD COLUMN IF NOT EXISTS edited_at timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_dispatch_carrier_messages_deleted
  ON public.dispatch_carrier_messages (deleted_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_freight_thread_messages_deleted
  ON public.freight_thread_messages (deleted_at)
  WHERE deleted_at IS NULL;
