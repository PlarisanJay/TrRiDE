-- Security: close the admin privilege-escalation hole.
-- Run in Supabase SQL Editor against the EXISTING database.
-- Order matters: clamp existing rows first, then lock the trigger, then RLS.

-- ─────────────────────────────────────────────────────────────
-- 1. Repair any account that self-assigned admin at sign-up.
--    These are privilege-escalation artefacts, not real admins.
--    List them here first and confirm before running the UPDATE.
-- ─────────────────────────────────────────────────────────────
SELECT id, email, full_name, role, status, created_at
FROM public.profiles
WHERE role = 'admin'
ORDER BY created_at;

-- Expected result: only the real admin account(s) you created by hand.
-- If a row above is an attacker, demote it:
--   UPDATE public.profiles SET role = 'student' WHERE id = '<uuid>';

-- ─────────────────────────────────────────────────────────────
-- 2. is_admin() reads the profiles table, not the JWT claim.
--    SECURITY DEFINER avoids infinite recursion on profiles.
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

-- ─────────────────────────────────────────────────────────────
-- 3. Admin policies must consult is_admin() ONLY.
--    The old branch below was the vulnerability, because
--    user_metadata is attacker-controlled at signUp():
--      (auth.jwt() -> 'user_metadata' ->> 'role') = 'admin'
--    With it, any client could register role:'admin' and then read
--    every profile (emails, phones, license + plate numbers).
-- ─────────────────────────────────────────────────────────────
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
-- 4. Clamp the signup trigger: 'admin' in metadata becomes 'student'.
--    Admin accounts must be created out-of-band, then approved.
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

-- ─────────────────────────────────────────────────────────────
-- 5. Verify: both should now be false for a normal signed-up user.
-- ─────────────────────────────────────────────────────────────
SELECT public.is_admin() AS is_admin_now;
