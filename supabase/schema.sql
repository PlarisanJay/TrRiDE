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
  username TEXT UNIQUE,
  student_id TEXT,
  university TEXT,
  course TEXT,
  year_level TEXT,
  -- driver fields
  license_no TEXT,
  vehicle_type TEXT,
  plate_number TEXT,
  license_expiry TEXT,
  -- profile fields
  avatar_url TEXT,
  is_online BOOLEAN DEFAULT false
);

-- 2. Auto-create profile when a new user signs up
-- NOTE: role comes from client-controlled signUp() metadata, so 'admin' is
-- explicitly downgraded to 'student'. Admin rows are created out-of-band
-- (Supabase dashboard / SQL) and then approved. Without this clamp, anyone
-- could sign up with role:'admin' and self-promote.
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

-- 3. Trigger to call handle_new_user on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 4. Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Admin check helper. Reads the profiles table (not the JWT) so a user cannot
-- forge admin by passing role:'admin' in signUp() metadata.
-- SECURITY DEFINER avoids infinite recursion when querying profiles.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND status = 'approved'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Users can view their own profile
DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
CREATE POLICY "Users can view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());

-- Admins can view all profiles
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
CREATE POLICY "Admins can view all profiles" ON profiles
  FOR SELECT USING (public.is_admin());

-- Approved users can view other approved users' profiles
DROP POLICY IF EXISTS "Approved users view approved profiles" ON profiles;
CREATE POLICY "Approved users view approved profiles" ON profiles
  FOR SELECT USING (
    status = 'approved'
  );

-- Admins can update any profile (approve/reject)
DROP POLICY IF EXISTS "Admins can update profiles" ON profiles;
CREATE POLICY "Admins can update profiles" ON profiles
  FOR UPDATE USING (public.is_admin());

-- Users can update their own profile (e.g. drivers toggle is_online)
DROP POLICY IF EXISTS "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile" ON profiles
  FOR UPDATE USING (
    id = auth.uid()
  ) WITH CHECK (
    id = auth.uid()
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

DROP POLICY IF EXISTS "Students view own trips" ON trips;
CREATE POLICY "Students view own trips" ON trips
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Drivers view trips" ON trips;
CREATE POLICY "Drivers view trips" ON trips
  FOR SELECT USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
    AND (status = 'pending' OR driver_id = auth.uid())
  );

DROP POLICY IF EXISTS "Students create trips" ON trips;
CREATE POLICY "Students create trips" ON trips
  FOR INSERT WITH CHECK (student_id = auth.uid());

DROP POLICY IF EXISTS "Drivers update trips" ON trips;
CREATE POLICY "Drivers update trips" ON trips
  FOR UPDATE USING (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
    AND (status = 'pending' OR driver_id = auth.uid())
  ) WITH CHECK (
    auth.uid() IN (SELECT id FROM profiles WHERE role = 'driver' AND status = 'approved')
  );

DROP POLICY IF EXISTS "Students cancel trips" ON trips;
CREATE POLICY "Students cancel trips" ON trips
  FOR UPDATE
  USING (student_id = auth.uid() AND status IN ('pending', 'accepted'))
  WITH CHECK (student_id = auth.uid());

-- 9. Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES auth.users(id),
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Conversations RLS
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Students view own conversations" ON conversations;
CREATE POLICY "Students view own conversations" ON conversations
  FOR SELECT USING (student_id = auth.uid());

DROP POLICY IF EXISTS "Drivers view own conversations" ON conversations;
CREATE POLICY "Drivers view own conversations" ON conversations
  FOR SELECT USING (driver_id = auth.uid());

DROP POLICY IF EXISTS "Participants create conversations" ON conversations;
CREATE POLICY "Participants create conversations" ON conversations
  FOR INSERT WITH CHECK (
    student_id = auth.uid() OR driver_id = auth.uid()
  );

DROP POLICY IF EXISTS "Participants update conversations" ON conversations;
CREATE POLICY "Participants update conversations" ON conversations
  FOR UPDATE USING (
    student_id = auth.uid() OR driver_id = auth.uid()
  );

-- 11. Messages table
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  trip_id UUID REFERENCES trips(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES auth.users(id),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. Messages RLS
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Participants view messages" ON messages;
CREATE POLICY "Participants view messages" ON messages
  FOR SELECT USING (
    sender_id = auth.uid()
    OR conversation_id IN (
      SELECT id FROM conversations
      WHERE student_id = auth.uid() OR driver_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Participants send messages" ON messages;
CREATE POLICY "Participants send messages" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND conversation_id IN (
      SELECT id FROM conversations
      WHERE student_id = auth.uid() OR driver_id = auth.uid()
    )
  );

-- 13. Auto-update updated_at on conversations
CREATE OR REPLACE FUNCTION update_conversation_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE conversations SET updated_at = NOW() WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_new_message ON messages;
CREATE TRIGGER on_new_message
  AFTER INSERT ON messages
  FOR EACH ROW EXECUTE FUNCTION update_conversation_timestamp();

-- 14. Enable Realtime for trips and messages tables
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
ALTER PUBLICATION supabase_realtime ADD TABLE messages;

-- 15. Ratings table (student rates driver after arriving at destination)
CREATE TABLE IF NOT EXISTS ratings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id UUID NOT NULL UNIQUE REFERENCES trips(id) ON DELETE CASCADE,
  driver_id UUID NOT NULL REFERENCES auth.users(id),
  student_id UUID NOT NULL REFERENCES auth.users(id),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. Ratings RLS
ALTER TABLE ratings ENABLE ROW LEVEL SECURITY;

-- Students can view their own ratings
DROP POLICY IF EXISTS "Students view own ratings" ON ratings;
CREATE POLICY "Students view own ratings" ON ratings
  FOR SELECT USING (student_id = auth.uid());

-- Drivers can view ratings given to them
DROP POLICY IF EXISTS "Drivers view their ratings" ON ratings;
CREATE POLICY "Drivers view their ratings" ON ratings
  FOR SELECT USING (driver_id = auth.uid());

-- Students create ratings only for their completed trips
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
