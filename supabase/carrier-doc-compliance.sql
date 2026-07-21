-- Carrier compliance fields for insurance / W-9 tracking (doc expiry alerts).
ALTER TABLE dispatch_carrier_roster
  ADD COLUMN IF NOT EXISTS insurance_expires_at DATE,
  ADD COLUMN IF NOT EXISTS w9_on_file BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS dot_number TEXT;

CREATE INDEX IF NOT EXISTS idx_dispatch_carrier_roster_insurance
  ON dispatch_carrier_roster(insurance_expires_at)
  WHERE active = true AND insurance_expires_at IS NOT NULL;
