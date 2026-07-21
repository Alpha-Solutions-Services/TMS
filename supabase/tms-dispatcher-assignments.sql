-- Assign dispatchers / sub dispatchers to carriers and drivers
-- Run in Supabase SQL Editor

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS assigned_dispatcher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE dispatch_driver_roster
  ADD COLUMN IF NOT EXISTS assigned_dispatcher_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS profiles_assigned_dispatcher_idx
  ON profiles (assigned_dispatcher_id) WHERE role = 'carrier';

CREATE INDEX IF NOT EXISTS dispatch_driver_roster_assigned_dispatcher_idx
  ON dispatch_driver_roster (assigned_dispatcher_id);
