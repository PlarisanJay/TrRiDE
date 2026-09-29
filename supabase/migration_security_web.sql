-- ============================================================================
-- TriRide — SECURITY HARDENING FOR PUBLIC WEB DEPLOY  (SEC-3 + SEC-4)
-- ============================================================================
-- Written: 2026-09-28
-- Run this BEFORE deploying the site to Vercel.
--
-- Fixes two real, currently-open holes:
--
--   SEC-3  storage.objects policies are `TO public` with only a bucket_id
--          check (migration_storage.sql:14-61). With a public anon key,
--          anyone can upload and OVERWRITE any file in avatars / message /
--          chat-media — including replacing other users' profile photos.
--
--   SEC-4  profiles "Approved users view approved profiles" has no
--          `TO` clause (schema.sql:103-104, migration.sql:18-19), so it
--          also applies to the `anon` role. An anonymous caller can
--          `GET /rest/v1/profiles?select=*` and read every approved
--          profile: email, phone, license_no, plate_number, student_id.
--
-- DOES NOT touch the signup trigger or the admin policies — those were
-- already hardened in migration_security_admin_rls.sql. See
-- 00-phase0-verification-addendum.md.
--
-- Rollback: supabase/rollback_security.sql
-- ============================================================================

-- ============================================================================
-- SEC-4 — profiles must not be readable by an anonymous caller
-- ============================================================================

-- The original policy is permissive-by-omission: without a `TO` clause it
-- applies to every role including `anon`. Recreate it against
-- `authenticated` only.
DROP POLICY IF EXISTS "Approved users view approved profiles" ON public.profiles;

CREATE POLICY "Approved users view approved profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (status = 'approved');

-- Narrow directory used where the app only needs a name and an avatar.
-- A view is used rather than a table policy so the sensitive columns are
-- never in the result set at all — the server never sends them, so RLS
-- cannot be forgotten at a future call site.
DROP VIEW IF EXISTS public.public_profiles;
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, full_name, avatar_url, role
  FROM public.profiles
  WHERE status = 'approved';

-- authenticated only. `anon` inherits nothing.
REVOKE ALL ON public.public_profiles FROM anon;
GRANT  SELECT ON public.public_profiles TO authenticated;


-- ============================================================================
-- SEC-3 — storage writes must be authenticated and owner-scoped
-- ============================================================================
--
-- DESIGN NOTE — READ IS DELIBERATELY LEFT PUBLIC. READ THIS BEFORE "FIXING" IT.
--
-- The app renders images with supabase-js `getPublicUrl()`:
--     data/auth.js:438                  (avatars)
--     screens/shared/MessagesScreen.js:754  (chat media)
-- `getPublicUrl` returns a /object/public/... URL that the browser fetches
-- with the `anon` role. If the SELECT policy required `authenticated`,
-- every avatar and every chat image in the app would stop rendering.
--
-- Worse, chat media cannot be owner-scoped on read anyway: the RECIPIENT of
-- a message has to be able to read the SENDER's upload. An owner-only read
-- policy is not satisfiable for chat media.
--
-- So this migration hardens WRITE, which is where the actual attack is
-- (anonymous upload + cross-user overwrite), and leaves READ as it already
-- was. To also lock reads later, switch every getPublicUrl() call to
-- createSignedUrl() with a long expiry and make SELECT owner/participant
-- scoped. That is a client change, not just a policy change.
--
-- CLIENT CHANGE REQUIRED (already applied, see migration notes):
--   data/auth.js               avatars/<userId>_<ts>.ext  ->  <userId>/<ts>.ext
--   MessagesScreen.js          chat/<ts>_<rand>.ext       ->  <userId>/<ts>_<rand>.ext
--   Without this the INSERT policy below REJECTS the upload and avatars
--   and chat images stop working.
-- ============================================================================

-- Drop the nine permissive policies from migration_storage.sql.
DROP POLICY IF EXISTS "Allow public uploads to avatars bucket"        ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to avatars bucket"        ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads from avatars bucket"    ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to message bucket"         ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to message bucket"         ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads from message bucket"     ON storage.objects;
DROP POLICY IF EXISTS "Allow public uploads to chat-media bucket"      ON storage.objects;
DROP POLICY IF EXISTS "Allow public updates to chat-media bucket"      ON storage.objects;
DROP POLICY IF EXISTS "Allow public downloads from chat-media bucket"  ON storage.objects;

-- --- avatars -------------------------------------------------------------
-- INSERT: authenticated, first path segment must be your own uid.
CREATE POLICY "Users upload own avatar" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own avatar" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- message bucket ------------------------------------------------------
-- Still referenced: data/auth.js:429 falls back to 'message' when the
-- 'avatars' bucket is missing. Kept owner-scoped so the fallback is not
-- an open door.
CREATE POLICY "Users upload own message file" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'message'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own message file" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'message'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'message'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- chat-media ----------------------------------------------------------
CREATE POLICY "Users upload own chat media" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users update own chat media" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  )
  WITH CHECK (
    bucket_id = 'chat-media'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

-- --- read ----------------------------------------------------------------
-- Preserved at the original permissiveness so getPublicUrl() keeps working.
-- See the DESIGN NOTE above. This is the one axis still open, and it is
-- open by choice, not by oversight.
CREATE POLICY "Allow public downloads from avatars bucket" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'avatars');

CREATE POLICY "Allow public downloads from message bucket" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'message');

CREATE POLICY "Allow public downloads from chat-media bucket" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'chat-media');


-- ============================================================================
-- Post-migration verification — run immediately. See plan section 3.6.
-- ============================================================================
--
-- 1. Anonymous read of profiles MUST return [] or 403.
--    curl -s "$URL/rest/v1/profiles?select=email,phone,license_no" \
--         -H "apikey: $ANON_KEY"
--
-- 2. Anonymous read of the narrow view MUST return [] or 403.
--    curl -s "$URL/rest/v1/public_profiles?select=*" -H "apikey: $ANON_KEY"
--
-- 3. Anonymous storage upload MUST return 401/403/400.
--    curl -s -X POST "$URL/storage/v1/object/avatars/hack.png" \
--         -H "apikey: $ANON_KEY" -H "Content-Type: image/png" --data-binary @x.png
--
-- 4. Privilege-escalation regression: signup with role=admin must yield
--    role=student, status=pending.
--    curl -s -X POST "$URL/auth/v1/signup" -H "apikey: $ANON_KEY" \
--         -H "Content-Type: application/json" \
--         -d '{"email":"probe@test.com","password":"Password123!","data":{"role":"admin"}}'
--
-- 5. THEN, signed in as a real user, confirm an avatar upload still works.
--    This is the one most likely to fail — if avatars stop uploading, the
--    client path is still flat instead of <uid>/... .
--
-- 6. Confirm existing (already-uploaded) avatars still render. They live at
--    the old flat paths; SELECT is unchanged, so they should.
