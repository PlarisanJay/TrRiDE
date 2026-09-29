-- ============================================================================
-- TriRide — ESCALATED ACCOUNT AUDIT + REPAIR   (SEC-1 residual)
-- ============================================================================
-- Written: 2026-09-28
--
-- The privilege-escalation path is ALREADY closed:
--   - supabase/schema.sql:54-55 and migration.sql:181-182 downgrade a
--     client-declared role of 'admin' to 'student' in the signup trigger.
--   - supabase/migration_security_admin_rls.sql rebuilds public.is_admin()
--     to read the profiles table (role + status) instead of the JWT claim,
--     and all admin policies call is_admin() only.
--
-- This file does NOT re-open or re-harden that. It only finds accounts that
-- may have been created through the old path BEFORE the fix, and lets you
-- demote them. That cleanup cannot be done by the app.
-- ============================================================================


-- ============================================================================
-- STEP 1 — AUDIT. Read-only. Safe to run any time.
-- ============================================================================
-- Expected result: ZERO rows.
--
-- If rows come back, those accounts were created while the trigger still
-- trusted client metadata. Each one can currently read and update every
-- profile in the database.
SELECT
  id,
  email,
  role,
  status,
  created_at,
  'DEMOTE THIS ACCOUNT' AS action_required
FROM public.profiles
WHERE role = 'admin'
  AND status <> 'approved'
ORDER BY created_at ASC;


-- ============================================================================
-- STEP 2 — REPAIR. Do NOT run this until you have eyeballed STEP 1.
-- ============================================================================
-- This demotes every non-approved admin to a rejected student.
--
-- It will NOT touch a legitimately provisioned admin, because those were
-- approved by hand and carry status = 'approved'. To confirm who your real
-- admin is, run this first:
--
--   SELECT id, email, role, status, created_at
--   FROM public.profiles
--   WHERE role = 'admin'
--   ORDER BY created_at ASC;
--
-- Only then run the UPDATE below. If a legitimate admin of yours turns out
-- to be unapproved, promote them explicitly afterwards:
--
--   UPDATE public.profiles SET status = 'approved' WHERE id = '<their-uid>';

-- UPDATE public.profiles
-- SET role = 'student', status = 'rejected'
-- WHERE role = 'admin'
--   AND status <> 'approved';


-- ============================================================================
-- STEP 3 — RESIDUAL RISK (not a vulnerability, a rate-limit problem)
-- ============================================================================
-- A client can still self-declare role = 'driver' at signup. That is by
-- design — RegisterScreen.js:220,243 offers student/driver and driver
-- accounts depend on it.
--
-- Those accounts land with status = 'pending' and are invisible to the app,
-- because App.js:100 gates the whole session on status === 'approved'.
-- So this is NOT a takeover.
--
-- The real exposure is that signup is unauthenticated and unthrottled, so
-- anyone can mass-create pending driver rows. Address that in the Supabase
-- dashboard (Auth -> Rate Limits / CAPTCHA), not in SQL. Adding a CAPTCHA
-- here would be defeated, since the request never touches this database
-- function.
--
-- To count how much of this is happening:
--
--   SELECT date_trunc('day', created_at) AS day, count(*)
--   FROM public.profiles
--   WHERE role = 'driver' AND status = 'pending'
--   GROUP BY 1 ORDER BY 1 DESC;
