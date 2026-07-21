-- Freight audit log, group messaging, and AI conversations
-- Run in Supabase SQL Editor (same project as Portal/TMS)

-- Extend role enum (middle-tier dispatcher between super and sub)
DO $$ BEGIN
  ALTER TYPE tms_role ADD VALUE IF NOT EXISTS 'dispatcher';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS freight_action_log (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email TEXT,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  meta        JSONB NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freight_action_log_created_idx ON freight_action_log (created_at DESC);
CREATE INDEX IF NOT EXISTS freight_action_log_actor_idx ON freight_action_log (actor_id);

CREATE TABLE IF NOT EXISTS freight_threads (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  thread_type TEXT NOT NULL DEFAULT 'group' CHECK (thread_type IN ('group', 'carrier')),
  carrier_profile_id UUID,
  created_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS freight_thread_members (
  thread_id   UUID NOT NULL REFERENCES freight_threads(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE TABLE IF NOT EXISTS freight_thread_messages (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id   UUID NOT NULL REFERENCES freight_threads(id) ON DELETE CASCADE,
  sender_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  sender_role TEXT NOT NULL,
  body        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS freight_thread_messages_thread_idx
  ON freight_thread_messages (thread_id, created_at);

CREATE TABLE IF NOT EXISTS freight_ai_conversations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title         TEXT,
  training_notes TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS freight_ai_messages (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID NOT NULL REFERENCES freight_ai_conversations(id) ON DELETE CASCADE,
  role             TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content          TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE freight_action_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_thread_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_thread_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_ai_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE freight_ai_messages ENABLE ROW LEVEL SECURITY;
