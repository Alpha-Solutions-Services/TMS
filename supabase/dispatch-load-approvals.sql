-- Sub-dispatcher load actions queue for super dispatcher review.
-- Run in Supabase SQL editor (ozuurnngrhqmttgubffc).

CREATE TABLE IF NOT EXISTS dispatch_load_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_id UUID REFERENCES dispatch_loads(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  payload JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  requested_by UUID NOT NULL REFERENCES auth.users(id),
  requested_by_email TEXT,
  reviewed_by UUID REFERENCES auth.users(id),
  review_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_dispatch_load_approvals_status
  ON dispatch_load_approvals(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dispatch_load_approvals_requested_by
  ON dispatch_load_approvals(requested_by);

ALTER TABLE dispatch_load_approvals ENABLE ROW LEVEL SECURITY;

-- Service role / API routes use service role; authenticated supers read all pending.
DROP POLICY IF EXISTS dispatch_approvals_super_select ON dispatch_load_approvals;
CREATE POLICY dispatch_approvals_super_select ON dispatch_load_approvals
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM tms_users u
      WHERE u.id = auth.uid()
        AND u.active = true
        AND u.role = 'super_dispatcher'
    )
  );

DROP POLICY IF EXISTS dispatch_approvals_sub_select ON dispatch_load_approvals;
CREATE POLICY dispatch_approvals_sub_select ON dispatch_load_approvals
  FOR SELECT TO authenticated
  USING (requested_by = auth.uid());
