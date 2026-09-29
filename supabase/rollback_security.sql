-- ============================================================================
-- TriRide — SECURITY ROLLBACK
-- ============================================================================
-- Purpose : restore the ORIGINAL (pre-hardening) policies if the hardened
--           policies in migration_security_web.sql break the app.
-- Run     : ONLY if something is broken. This RE-OPENS the vulnerabilities
--           described in migration_security_web.sql, so treat it as an
--           emergency measure, not a fix.
-- Order   : run this file INSTEAD of the hardening migration, not after.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Restore: profiles "Approved users view approved profiles"
-- ORIGINAL had no TO clause, so it also applied to the anon role.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Approved users view approved profiles" ON public.profiles;
CREATE POLICY "Approved users view approved profiles" ON public.profiles
  FOR SELECT USING (status = 'approved');

-- ---------------------------------------------------------------------------
-- Restore: storage policies (TO public, bucket_id only)
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users upload own avatar"        ON storage.objects;
DROP POLICY IF EXISTS "Users update own avatar"        ON storage.objects;
DROP POLICY IF EXISTS "Users read any object"          ON storage.objects;
DROP POLICY IF EXISTS "Users upload own chat media"    ON storage.objects;
DROP POLICY IF EXISTS "Users update own chat media"    ON storage.objects;

CREATE POLICY "Allow public uploads to avatars bucket"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Allow public updates to avatars bucket"
  ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'avatars')
  WITH CHECK (bucket_id = 'avatars');

CREATE POLICY "Allow public downloads from avatars bucket"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Allow public uploads to message bucket"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'message');

CREATE POLICY "Allow public updates to message bucket"
  ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'message')
  WITH CHECK (bucket_id = 'message');

CREATE POLICY "Allow public downloads from message bucket"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'message');

CREATE POLICY "Allow public uploads to chat-media bucket"
  ON storage.objects FOR INSERT TO public
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Allow public updates to chat-media bucket"
  ON storage.objects FOR UPDATE TO public
  USING (bucket_id = 'chat-media')
  WITH CHECK (bucket_id = 'chat-media');

CREATE POLICY "Allow public downloads from chat-media bucket"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'chat-media');

-- ---------------------------------------------------------------------------
-- Restore: the permissive profiles view is dropped either way. Recreate the
-- wide SELECT surface by relying on the policy above.
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_profiles;
