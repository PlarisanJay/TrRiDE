-- Migration: Fix missing columns, RLS policies, driver cancel bug, and Realtime
-- Run this in Supabase SQL Editor for EXISTING databases
-- Updated: Added Fix 5 & 6 for admin dashboard realtime + RLS (APK build issue)

-- 1. Add missing columns to profiles
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 2. Allow approved users to see each other's profiles
DROP POLICY IF EXISTS "Approved users view approved profiles" ON profiles;
CREATE POLICY "Approved users view approved profiles" ON profiles
  FOR SELECT USING (
    status = 'approved'
  );

-- 2b. Allow users to update their OWN profile (drivers toggle is_online)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
  ) WITH CHECK (
    id = auth.uid()
  );

-- 3. Fix driver trip update policy (WITH CHECK was blocking cancel/decline)
DROP POLICY IF EXISTS "Drivers update trips" ON trips;
CREATE POLICY "Drivers update trips" ON trips
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
    AND (status = 'pending' OR driver_id = auth.uid())
  ) WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
  );

-- 4. Enable Realtime on trips and messages tables
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE trips;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE messages;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 5. PER-CONVERSATION READ TRACKING
-- Track when each participant last read their conversation so unread badges
-- clear correctly after the user has opened/read the messages.
DO $$ BEGIN
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS student_last_read_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE conversations ADD COLUMN IF NOT EXISTS driver_last_read_at TIMESTAMPTZ;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 6. RATINGS TABLE (student rates driver after reaching the destination)
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  student_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own ratings" ON ratings;
CREATE POLICY "Students view own ratings" ON ratings
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Drivers view their ratings" ON ratings;
CREATE POLICY "Drivers view their ratings" ON ratings
  FOR SELECT USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Students create ratings" ON ratings;
CREATE POLICY "Students create ratings" ON ratings
  FOR INSERT WITH CHECK (
    student_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM trips
      WHERE trips.id = trip_id
        AND trips.student_id = auth.uid()
        AND trips.status = 'completed'
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 7. FIX: Add `profiles` to Supabase Realtime publication
-- Without this, the admin dashboard real-time listener
-- (listening for INSERT on profiles) never fires.
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 8. FIX: Admin RLS — create is_admin() SECURITY DEFINER helper
-- so admin policies can check the profiles table directly
-- instead of relying solely on auth.jwt() user_metadata.
--
-- SECURITY NOTE: the admin policies below must use is_admin() ONLY.
-- Do NOT reintroduce the old branch:
--   (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
-- user_metadata is attacker-controlled at signUp(), so any client could
-- register with role:'admin' and gain admin RLS access.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    public.is_admin()
  );

DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    public.is_admin()
  );

-- ─────────────────────────────────────────────────────────────
-- 9. FIX: Add `username` column to profiles (extended registration)
-- ─────────────────────────────────────────────────────────────
DO $$ BEGIN
  ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Unique index on username (skip if it already exists)
DO $$ BEGIN
  CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles (username)
    WHERE username IS NOT NULL AND username <> '';
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- ─────────────────────────────────────────────────────────────
-- 10. Update handle_new_user trigger to write extended fields
-- (username, student_id, license_no, plate_number) from
-- auth metadata supplied during signUp().
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    phone,
    role,
    username,
    student_id,
    license_no,
    plate_number
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    CASE
      WHEN COALESCE(NEW.raw_user_meta_data->>'role', '') = 'admin' THEN 'student'
      ELSE COALESCE(NEW.raw_user_meta_data->>'role', 'student')
    END,
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'username', ''), ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'student_id', ''), ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'license_no', ''), ''),
    NULLIF(COALESCE(NEW.raw_user_meta_data->>'plate_number', ''), '')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Re-attach trigger (drop first to avoid duplicate)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
