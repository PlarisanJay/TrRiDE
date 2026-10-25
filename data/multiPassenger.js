// ─────────────────────────────────────────────────────────────
// Multi-passenger data access.
//
// Kept separate from data/trips.js so the existing single-passenger
// functions are not modified at all.
// ─────────────────────────────────────────────────────────────

import { supabase } from '../config/supabase';
import { sortByAcceptance } from './rideQueue';

/**
 * All trips currently owned by this driver, plus recently cancelled trips
 * so the queue can keep a red "Cancelled" card after reopening the screen.
 *
 * Cancelled rows are only included when they were actually accepted first
 * (accepted_at is set). Declined pending requests are not passengers and
 * must never appear in this queue.
 */
export const getDriverMultiPassengerTrips = async (driverId) => {
  if (!driverId) return [];

  const { data: activeRows, error: activeError } = await supabase
    .from('trips')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'in_progress']);

  if (activeError) throw activeError;

  const active = activeRows || [];
  if (active.length === 0) return [];

  // Only look back as far as the oldest active trip (minus a small buffer).
  // This keeps the queue scoped to the current trip instead of all history.
  const oldestActiveTime = Math.min(
    ...active.map((trip) => {
      const raw = trip.accepted_at || trip.created_at;
      const time = raw ? new Date(raw).getTime() : Date.now();
      return Number.isNaN(time) ? Date.now() : time;
    })
  );
  const cutoff = new Date(oldestActiveTime - 60 * 60 * 1000).toISOString();

  const { data: cancelledRows, error: cancelledError } = await supabase
    .from('trips')
    .select('*')
    .eq('driver_id', driverId)
    .eq('status', 'cancelled')
    .gte('updated_at', cutoff)
    .order('updated_at', { ascending: false })
    .limit(7);

  if (cancelledError) throw cancelledError;

  const cancelled = (cancelledRows || []).filter((trip) => Boolean(trip.accepted_at));

  return sortByAcceptance([...active, ...cancelled]);
};

/**
 * Persist the derived fixed-segment match for audit/route filtering.
 * No-op until approved road-segment data is configured.
 */
export const saveTripRouteSegment = async (tripId, segment) => {
  if (!tripId || !segment?.segmentId) return null;

  const { data, error } = await supabase
    .from('trips')
    .update({
      segment_id: segment.segmentId,
      direction: segment.direction,
    })
    .eq('id', tripId)
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

/**
 * Used by the student cancel button. The check runs on the server because
 * students cannot read other passengers' trips under RLS.
 *
 * Returns true only when this passenger is the locked current pick-up target
 * of a multi-passenger trip. Single-passenger trips always return false.
 */
export const isPassengerCancelLocked = async (trip) => {
  if (!trip?.id || trip.status !== 'accepted' || !trip.driver_id) return false;

  const { data, error } = await supabase.rpc('is_passenger_cancel_locked', {
    p_trip_id: trip.id,
  });

  if (error) throw error;
  return data === true;
};
