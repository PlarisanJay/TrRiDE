-- ─────────────────────────────────────────────────────────────────────────────
-- Multi-passenger ongoing ride support
--
-- Additive only. No existing columns, rows, policies, or statuses are changed.
-- Safe to run more than once (IF NOT EXISTS / CREATE OR REPLACE / DROP TRIGGER IF EXISTS).
--
-- Run this in Supabase Dashboard → SQL Editor before enabling:
--   EXPO_PUBLIC_ENABLE_MULTI_PASSENGER_RIDE=true
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Lifecycle timestamps and optional route-segment audit fields.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS accepted_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS picked_up_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dropped_off_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS segment_id    TEXT,
  ADD COLUMN IF NOT EXISTS direction     TEXT;

-- 2. Backfill timestamps for trips that were already active/completed.
-- updated_at is the closest reliable historical timestamp we have.
UPDATE public.trips
SET accepted_at = COALESCE(accepted_at, updated_at, created_at)
WHERE status IN ('accepted', 'in_progress')
  AND accepted_at IS NULL;

UPDATE public.trips
SET picked_up_at = COALESCE(picked_up_at, updated_at, created_at)
WHERE status = 'in_progress'
  AND picked_up_at IS NULL;

UPDATE public.trips
SET dropped_off_at = COALESCE(dropped_off_at, updated_at, created_at)
WHERE status = 'completed'
  AND dropped_off_at IS NULL;

-- 3. Keep timestamps accurate without changing any existing client function.
--    accepted_at    = first time status becomes 'accepted'
--    picked_up_at   = first time status becomes 'in_progress'
--    dropped_off_at = first time status becomes 'completed'
-- Existing non-null values are never overwritten.
CREATE OR REPLACE FUNCTION public.set_trip_lifecycle_timestamps()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'accepted' AND NEW.accepted_at IS NULL THEN
    NEW.accepted_at := NOW();
  END IF;

  IF NEW.status = 'in_progress' THEN
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := NOW();
    END IF;
    IF NEW.picked_up_at IS NULL THEN
      NEW.picked_up_at := NOW();
    END IF;
  END IF;

  IF NEW.status = 'completed' THEN
    IF NEW.picked_up_at IS NULL THEN
      NEW.picked_up_at := NOW();
    END IF;
    IF NEW.dropped_off_at IS NULL THEN
      NEW.dropped_off_at := NOW();
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_trip_lifecycle_timestamps ON public.trips;
CREATE TRIGGER set_trip_lifecycle_timestamps
  BEFORE UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.set_trip_lifecycle_timestamps();

-- 4. Server-side lock for the current pick-up target.
--    Students cannot read other passengers' trip rows under RLS, so the
--    check must run in a SECURITY DEFINER function.
CREATE OR REPLACE FUNCTION public.is_trip_pickup_locked(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver_id UUID;
  v_status TEXT;
  v_active_count INTEGER;
  v_first_waiting UUID;
BEGIN
  SELECT driver_id, status
    INTO v_driver_id, v_status
    FROM public.trips
   WHERE id = p_trip_id;

  IF NOT FOUND OR v_driver_id IS NULL OR v_status <> 'accepted' THEN
    RETURN FALSE;
  END IF;

  SELECT COUNT(*)
    INTO v_active_count
    FROM public.trips
   WHERE driver_id = v_driver_id
     AND status IN ('accepted', 'in_progress');

  -- Single-passenger trips are never locked. This keeps current behavior.
  IF v_active_count < 2 THEN
    RETURN FALSE;
  END IF;

  SELECT id
    INTO v_first_waiting
    FROM public.trips
   WHERE driver_id = v_driver_id
     AND status = 'accepted'
   ORDER BY COALESCE(accepted_at, created_at), created_at, id
   LIMIT 1;

  RETURN COALESCE(p_trip_id = v_first_waiting, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.is_passenger_cancel_locked(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_is_owner BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
      FROM public.trips
     WHERE id = p_trip_id
       AND student_id = auth.uid()
  ) INTO v_is_owner;

  IF NOT v_is_owner THEN
    RAISE EXCEPTION 'Not allowed to check this trip';
  END IF;

  RETURN public.is_trip_pickup_locked(p_trip_id);
END;
$$;

REVOKE ALL ON FUNCTION public.is_trip_pickup_locked(UUID) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.is_passenger_cancel_locked(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_passenger_cancel_locked(UUID) TO authenticated;

-- RLS is intentionally unchanged. Existing permissive policies already cover
-- every read/update used by this feature. The pickup-target rule is enforced
-- by the app through is_passenger_cancel_locked(), so a build with the feature
-- flag OFF keeps the old database behavior exactly as it was.
--
-- If you later want hard database-level enforcement, it must be enabled by a
-- server-side setting/table, not by this client build flag. Do not add an
-- unconditional restrictive policy here: it would change old builds too.

-- 5. Fast lookups for "my active rides" and stable acceptance ordering.
CREATE INDEX IF NOT EXISTS trips_driver_active_idx
  ON public.trips (driver_id, status, accepted_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROLLBACK (only if you need to remove the feature completely)
-- ─────────────────────────────────────────────────────────────────────────────
-- DROP POLICY IF EXISTS "Students cannot cancel locked pickup" ON public.trips;
-- DROP FUNCTION IF EXISTS public.is_passenger_cancel_locked(UUID);
-- DROP FUNCTION IF EXISTS public.is_trip_pickup_locked(UUID);
-- DROP TRIGGER IF EXISTS set_trip_lifecycle_timestamps ON public.trips;
-- DROP FUNCTION IF EXISTS public.set_trip_lifecycle_timestamps();
-- DROP INDEX IF EXISTS public.trips_driver_active_idx;
-- ALTER TABLE public.trips
--   DROP COLUMN IF EXISTS dropped_off_at,
--   DROP COLUMN IF EXISTS picked_up_at,
--   DROP COLUMN IF EXISTS accepted_at,
--   DROP COLUMN IF EXISTS direction,
--   DROP COLUMN IF EXISTS segment_id;
