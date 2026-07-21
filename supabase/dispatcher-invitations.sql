-- Dispatcher / sub-dispatcher token invites (7-day expiry, same pattern as driver_invitations)
-- Run once in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS dispatcher_invitations (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invited_by    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  invitee_email TEXT NOT NULL,
  invitee_name  TEXT,
  team_role     TEXT NOT NULL CHECK (team_role IN ('dispatcher', 'sub_dispatcher')),
  token         TEXT NOT NULL UNIQUE,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'accepted', 'expired', 'revoked')),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS dispatcher_invitations_token_idx ON dispatcher_invitations (token);
CREATE INDEX IF NOT EXISTS dispatcher_invitations_email_idx ON dispatcher_invitations (lower(invitee_email));

ALTER TABLE dispatcher_invitations ENABLE ROW LEVEL SECURITY;

-- Service role only (API routes use service role)
CREATE POLICY dispatcher_invitations_service ON dispatcher_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);
