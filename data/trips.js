import { supabase } from '../config/supabase';
import { haversineDistance } from '../config/mapConfig';

// ── Trips: Create ─────────────────────────────────────────────
export const createTrip = async ({
  student_id,
  pickup_lat,
  pickup_lng,
  pickup_text,
  dest_lat,
  dest_lng,
  dest_text,
  passengers,
  notes,
}) => {
  const { data, error } = await supabase
    .from('trips')
    .insert({
      student_id,
      pickup_lat,
      pickup_lng,
      pickup_text,
      dest_lat,
      dest_lng,
      dest_text,
      passengers: passengers || 1,
      notes: notes || null,
      status: 'pending',
    })
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Get by ID ──────────────────────────────────────────
export const getTripById = async (tripId) => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Get Pending (for drivers) ──────────────────────────
export const getPendingTrips = async () => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data;
};

// ── Trips: Accept ─────────────────────────────────────────────
export const acceptTrip = async (tripId, driverId) => {
  const { data, error } = await supabase
    .from('trips')
    .update({ driver_id: driverId, status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Decline (cancel by driver) ─────────────────────────
export const declineTrip = async (tripId) => {
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Start ──────────────────────────────────────────────
export const startTrip = async (tripId) => {
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'in_progress', updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('status', 'accepted')
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Complete ───────────────────────────────────────────
export const completeTrip = async (tripId, fare) => {
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'completed', fare, updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('status', 'in_progress')
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Cancel by Student ──────────────────────────────────
export const cancelTripByStudent = async (tripId) => {
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .in('status', ['pending', 'accepted'])
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

// ── Trips: Subscribe to a single trip ─────────────────────────
export const subscribeToTrip = (tripId, callback) => {
  const channel = supabase
    .channel(`trip-${tripId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'trips', filter: `id=eq.${tripId}` },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
};

// ── Trips: Subscribe to new pending trips ─────────────────────
export const subscribeToPendingTrips = (callback) => {
  const channel = supabase
    .channel('pending-trips')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'trips', filter: 'status=eq.pending' },
      (payload) => callback(payload.new)
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
};

// ── Trips: Get by Student ID ──────────────────────────────────
export const getTripsByStudent = async (studentId) => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('student_id', studentId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

// ── Fare Calculation ──────────────────────────────────────────
export const calculateFare = (distanceKm) => {
  const BASE_FARE = 15;
  const PER_KM = 8;
  const fare = BASE_FARE + distanceKm * PER_KM;
  return Math.round(fare * 100) / 100;
};
