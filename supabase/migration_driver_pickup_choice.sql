-- ─────────────────────────────────────────────────────────────────────────────
-- Driver-selected next pick-up for multi-passenger rides.
--
-- Additive migration. Run after migration_multi_passenger.sql.
-- Safe to run more than once.
--
-- The driver may choose any accepted passenger as the next pick-up. The
-- choice is stored on the trip row so it survives screen reloads and so the
-- student cancellation lock can follow the actual target.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Current selected pick-up target. Null means "the driver has not chosen
--    yet"; no passenger is treated as next and nobody is locked.
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS pickup_selected_at TIMESTAMPTZ;

-- 2. At most one selected target per driver. The partial index only covers
--    accepted trips, so picking up or cancelling a trip automatically removes
--    it from the constraint.
CREATE UNIQUE INDEX IF NOT EXISTS trips_one_selected_pickup_per_driver
  ON public.trips (driver_id)
  WHERE status = 'accepted' AND pickup_selected_at IS NOT NULL;

-- 3. Driver RPC: clear the previous target, then select the new one. Two
--    statements are intentional so the partial unique index never sees two
--    selected rows at once.
CREATE OR REPLACE FUNCTION public.set_next_pickup(p_trip_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_driver_id UUID;
  v_status TEXT;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT driver_id, status
    INTO v_driver_id, v_status
    FROM public.trips
   WHERE id = p_trip_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trip not found';
  END IF;

  IF v_driver_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Not allowed to select this trip';
  END IF;

  IF v_status <> 'accepted' THEN
    RAISE EXCEPTION 'Only accepted trips can be selected for pick-up';
  END IF;

  UPDATE public.trips
     SET pickup_selected_at = NULL
   WHERE driver_id = auth.uid()
     AND status = 'accepted'
     AND pickup_selected_at IS NOT NULL;

  UPDATE public.trips
     SET pickup_selected_at = NOW()
   WHERE id = p_trip_id
     AND driver_id = auth.uid()
     AND status = 'accepted';

  RETURN TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.set_next_pickup(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_next_pickup(UUID) TO authenticated;

-- 4. Clear the target when the trip leaves "accepted" (picked up, completed,
--    cancelled, or otherwise changed).
CREATE OR REPLACE FUNCTION public.clear_pickup_selection_on_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM 'accepted' THEN
    NEW.pickup_selected_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clear_pickup_selection_on_status ON public.trips;
CREATE TRIGGER clear_pickup_selection_on_status
  BEFORE UPDATE OF status ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.clear_pickup_selection_on_status();

-- 5. Keep the student cancellation lock aligned with the driver's choice.
--    No target means nobody is locked. This is intentional: the driver must
--    choose a pick-up; acceptance order never selects one automatically.
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
  v_target_id UUID;
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
    INTO v_target_id
    FROM public.trips
   WHERE driver_id = v_driver_id
     AND status = 'accepted'
     AND pickup_selected_at IS NOT NULL
   ORDER BY pickup_selected_at DESC
   LIMIT 1;

  IF v_target_id IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN p_trip_id = v_target_id;
END;
$$;

REVOKE ALL ON FUNCTION public.is_trip_pickup_locked(UUID) FROM PUBLIC;

-- 6. Fast lookup for the selected target.
CREATE INDEX IF NOT EXISTS trips_driver_selected_pickup_idx
  ON public.trips (driver_id, pickup_selected_at DESC)
  WHERE status = 'accepted' AND pickup_selected_at IS NOT NULL;

-- Make the new column and RPC visible to PostgREST immediately.
NOTIFY pgrst, 'reload schema';

-- ROLLBACK (only if the feature needs to be removed completely)
-- Run these in order, then re-run section 4 of migration_multi_passenger.sql
-- to restore the old acceptance-order-only is_trip_pickup_locked function.
-- DROP INDEX IF EXISTS public.trips_driver_selected_pickup_idx;
-- DROP TRIGGER IF EXISTS clear_pickup_selection_on_status ON public.trips;
-- DROP FUNCTION IF EXISTS public.clear_pickup_selection_on_status();
-- DROP FUNCTION IF EXISTS public.set_next_pickup(UUID);
-- ALTER TABLE public.trips DROP COLUMN IF EXISTS pickup_selected_at;
