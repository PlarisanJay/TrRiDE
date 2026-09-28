import { supabase } from '../config/supabase';

// ── Ratings: Create (student rates driver after trip completion) ──
export const createRating = async ({ tripId, driverId, studentId, rating }) => {
  const { data, error } = await supabase
    .from('ratings')
    .insert({
      trip_id: tripId,
      driver_id: driverId,
      student_id: studentId,
      rating,
    })
    .select()
    .maybeSingle();

  if (error) throw error;
  return data;
};

// ── Ratings: Check if a student already rated a trip ────────────
export const hasRatedTrip = async (tripId, studentId) => {
  const { data, error } = await supabase
    .from('ratings')
    .select('rating')
    .eq('trip_id', tripId)
    .eq('student_id', studentId)
    .maybeSingle();

  if (error) throw error;
  return data || null;
};

// ── Ratings: Get average rating received by a driver ────────────
export const getDriverRating = async (driverId) => {
  const { data, error } = await supabase
    .from('ratings')
    .select('rating')
    .eq('driver_id', driverId);

  if (error) throw error;

  const ratings = data || [];
  if (ratings.length === 0) return { average: null, count: 0 };

  const total = ratings.reduce((sum, r) => sum + r.rating, 0);
  return { average: total / ratings.length, count: ratings.length };
};

// ── Ratings: Get all ratings received by a driver ───────────────
export const getRatingsByDriver = async (driverId) => {
  const { data, error } = await supabase
    .from('ratings')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
};