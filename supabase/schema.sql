-- TriRide Database Schema for Supabase
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard → SQL Editor → New Query

-- 1. Profiles table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT NOT NULL CHECK (role IN ('student', 'driver', 'admin')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  -- student fields
  student_id TEXT,
  university TEXT,
  course TEXT,
  year_level TEXT,
  -- driver fields
  license_no TEXT,
  vehicle_type TEXT,
  plate_number TEXT,
  license_expiry TEXT
);

-- 2. Auto-create profile when a new user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, phone, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'phone', ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'student')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Trigger to call handle_new_user on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Users can view their own profile
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admins can view all profiles (reads role from JWT to avoid recursion)
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- Admins can update any profile (approve/reject)
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (
    (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
  );

-- 6. Seed the admin profile (if the admin auth user was created via dashboard)
-- This handles the case where the trigger already ran or needs manual insert
-- Run this AFTER creating the admin user in Authentication → Users
-- INSERT INTO profiles (id, email, full_name, phone, role, status)
-- VALUES ('<admin-auth-user-uuid>', 'admin@triride.com', 'Admin User', '+1 (555) 000-0000', 'admin', 'approved')
-- ON CONFLICT (id) DO NOTHING;

-- 7. Trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES profiles(id),
  driver_id UUID REFERENCES profiles(id),
  pickup_lat DOUBLE PRECISION NOT NULL,
  pickup_lng DOUBLE PRECISION NOT NULL,
  pickup_text TEXT,
  dest_lat DOUBLE PRECISION NOT NULL,
  dest_lng DOUBLE PRECISION NOT NULL,
  dest_text TEXT,
  passengers INTEGER DEFAULT 1,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','accepted','in_progress','completed','cancelled')),
  fare DOUBLE PRECISION,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Trips RLS
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Students view own trips" ON trips
  FOR SELECT USING (student_id = auth.uid());

CREATE POLICY "Drivers view trips" ON trips
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
    AND (status = 'pending' OR driver_id = auth.uid())
  );

CREATE POLICY "Students create trips" ON trips
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Drivers update trips" ON trips;
CREATE POLICY "Drivers update trips" ON trips
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
    AND (status = 'pending' OR driver_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students cancel trips" ON trips;
CREATE POLICY "Students cancel trips" ON trips
  FOR UPDATE
  USING (student_id = auth.uid() AND status IN ('pending', 'accepted'))
  WITH CHECK (student_id = auth.uid());
