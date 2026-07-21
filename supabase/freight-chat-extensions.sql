-- Chat extensions: load threads, attachments, carrier messages table
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS dispatch_carrier_messages (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carrier_profile_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_profile_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role         TEXT NOT NULL CHECK (sender_role IN ('dispatcher', 'carrier')),
  body                TEXT NOT NULL,
  attachments         JSONB NOT NULL DEFAULT '[]',
  read_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatch_carrier_messages_carrier_idx
  ON dispatch_carrier_messages (carrier_profile_id, created_at);

ALTER TABLE freight_threads
  ADD COLUMN IF NOT EXISTS load_id UUID,
  ADD COLUMN IF NOT EXISTS load_number TEXT;

ALTER TABLE freight_thread_messages
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]';

-- Allow load thread type
ALTER TABLE freight_threads DROP CONSTRAINT IF EXISTS freight_threads_thread_type_check;
ALTER TABLE freight_threads ADD CONSTRAINT freight_threads_thread_type_check
  CHECK (thread_type IN ('group', 'carrier', 'load'));

CREATE INDEX IF NOT EXISTS freight_threads_load_idx ON freight_threads (load_id);

-- Storage bucket for chat attachments (create in Dashboard if missing)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('freight-chat-attachments', 'freight-chat-attachments', false) ON CONFLICT DO NOTHING;
