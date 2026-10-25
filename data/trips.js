import { supabase } from '../config/supabase';
import { haversineDistance } from '../config/mapConfig';
import { sendPushToUser, sendLocalNotification } from './pushNotifications';
import { createNotification } from './notifications';

// Maximum passengers a driver can carry across all active trips
export const MAX_PASSENGERS = 7;

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

// ── Trips: Get Pending (for drivers with optional capacity filter) ──
export const getPendingTrips = async (availableSeats = null) => {
  let query = supabase
    .from('trips')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true });

  if (availableSeats !== null && availableSeats !== undefined) {
    const maxCapacity = Math.max(0, parseInt(availableSeats, 10));
    query = query.lte('passengers', maxCapacity);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
};

// ── Trips: Get driver's current active passenger count ────────
export const getDriverActivePassengerCount = async (driverId) => {
  const { data, error } = await supabase
    .from('trips')
    .select('passengers')
    .eq('driver_id', driverId)
    .in('status', ['accepted', 'in_progress']);

  if (error) throw error;
  return (data || []).reduce((sum, t) => sum + (t.passengers || 1), 0);
};

// ── Trips: Accept (with capacity check) ───────────────────────
export const acceptTrip = async (tripId, driverId, tripPassengers = null) => {
  // 1. Get the trip to know its passenger count if not already provided
  let incoming = tripPassengers;
  if (incoming == null) {
    const { data: tripToAccept, error: fetchErr } = await supabase
      .from('trips')
      .select('passengers')
      .eq('id', tripId)
      .single();

    if (fetchErr) throw fetchErr;
    incoming = tripToAccept?.passengers || 1;
  }

  // 2. Check capacity
  const currentCount = await getDriverActivePassengerCount(driverId);
  if (currentCount + incoming > MAX_PASSENGERS) {
    throw new Error(`Cannot accept: you already have ${currentCount}/${MAX_PASSENGERS} passengers. This ride needs ${incoming} more seat${incoming > 1 ? 's' : ''}.`);
  }

  // 3. Accept the trip
  const { data, error } = await supabase
    .from('trips')
    .update({ driver_id: driverId, status: 'accepted', updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) throw error;

  // Notify student that driver accepted the ride
  try {
    if (data?.student_id) {
      await createNotification({
        userId: data.student_id,
        type: 'trip',
        title: 'Ride Accepted',
        body: 'A driver has accepted your ride request.',
        data: { screen: 'OrderDetails', tripId: data.id },
      });
      sendLocalNotification('Ride Accepted', 'A driver has accepted your ride request.', { screen: 'OrderDetails', tripId: data.id }).catch(() => {});
    }
  } catch (e) {}

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
export const completeTrip = async (tripId) => {
  const { data, error } = await supabase
    .from('trips')
    .update({ status: 'completed', updated_at: new Date().toISOString() })
    .eq('id', tripId)
    .eq('status', 'in_progress')
    .select()
    .single();

  if (error) throw error;
  return data;
};

// ── Trips: Cancel with Reason (for Student or Driver) ─────────
export const cancelTripWithReason = async ({ tripId, role = 'student', reason = '' }) => {
  if (!tripId) throw new Error('Missing trip ID');

  // 1. Fetch current trip to check status and counterpart ID
  const { data: currentTrip, error: fetchErr } = await supabase
    .from('trips')
    .select('*')
    .eq('id', tripId)
    .single();

  if (fetchErr) throw fetchErr;

  // 2. Reject if currently in riding (in_progress)
  if (currentTrip.status === 'in_progress') {
    throw new Error('This ride is currently in progress and cannot be cancelled while on the road.');
  }

  if (currentTrip.status === 'completed' || currentTrip.status === 'cancelled') {
    return currentTrip;
  }

  // 3. Format cancellation note
  const roleLabel = role === 'driver' ? 'Driver' : 'Student';
  const cleanReason = reason && reason.trim() ? reason.trim() : 'Cancelled by user';
  const cancellationNote = `[Cancelled by ${roleLabel}: ${cleanReason}]`;
  const existingNotes = currentTrip.notes ? currentTrip.notes.trim() : '';
  const updatedNotes = existingNotes ? `${existingNotes}\n${cancellationNote}` : cancellationNote;

  // 4. Update trip in database to cancelled
  const { data: updatedTrip, error: updateErr } = await supabase
    .from('trips')
    .update({
      status: 'cancelled',
      notes: updatedNotes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', tripId)
    .in('status', ['pending', 'accepted'])
    .select()
    .maybeSingle();

  if (updateErr) throw updateErr;

  // 5. Notify the counterpart user via Push Notification & Local Notification
  try {
    const targetUserId = role === 'driver' ? currentTrip.student_id : currentTrip.driver_id;
    if (targetUserId) {
      const notifTitle = `Ride Cancelled by ${roleLabel}`;
      const notifBody = `${roleLabel} cancelled the ride request. Reason: "${cleanReason}"`;
      sendPushToUser(targetUserId, notifTitle, notifBody, {
        tripId,
        type: 'trip_cancelled',
        reason: cleanReason,
      }).catch(() => {});
    }

    sendLocalNotification(
      'Ride Cancelled',
      `Your ride has been cancelled and terminated. Reason: "${cleanReason}"`,
      { tripId, type: 'trip_cancelled' }
    ).catch(() => {});
  } catch (e) {
    console.warn('Failed to notify counterpart of cancellation:', e);
  }

  return updatedTrip || currentTrip;
};

// ── Trips: Cancel by Student (backward-compatible wrapper) ─────
export const cancelTripByStudent = async (tripId, reason = '') => {
  return cancelTripWithReason({ tripId, role: 'student', reason });
};

// ── Trips: Cancel by Driver ───────────────────────────────────
export const cancelTripByDriver = async (tripId, reason = '') => {
  return cancelTripWithReason({ tripId, role: 'driver', reason });
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

// ── Trips: Subscribe to pending trips (INSERT, UPDATE, DELETE) ──
export const subscribeToPendingTrips = (callback) => {
  const uniqueSubId = Math.random().toString(36).substring(2, 9);
  const channel = supabase
    .channel(`pending-trips-${uniqueSubId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips' },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
    )
    .subscribe();

  return () => supabase.removeChannel(channel);
};

// ── Trips: Subscribe to driver's active trips (for real-time capacity updates) ──
export const subscribeToDriverTrips = (driverId, callback) => {
  if (!driverId) return () => {};
  const uniqueSubId = Math.random().toString(36).substring(2, 9);
  const channel = supabase
    .channel(`driver-trips-${uniqueSubId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'trips', filter: `driver_id=eq.${driverId}` },
      (payload) => {
        if (typeof callback === 'function') {
          callback(payload);
        }
      }
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

// ── Trips: Get by Driver ID (ride history) ────────────────────
export const getTripsByDriver = async (driverId) => {
  const { data, error } = await supabase
    .from('trips')
    .select('*')
    .eq('driver_id', driverId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
};

// ── Trips: Get completed trips by student for stats ───────────
export const getStudentTripStats = async (studentId) => {
  const { data, error } = await supabase
    .from('trips')
    .select('status')
    .eq('student_id', studentId);

  if (error) throw error;

  const completed = (data || []).filter((t) => t.status === 'completed').length;

  return { totalRides: completed };
};

// ── Trips: Get driver stats ───────────────────────────────────
export const getDriverStats = async (driverId) => {
  const { data, error } = await supabase
    .from('trips')
    .select('status')
    .eq('driver_id', driverId);

  if (error) throw error;

  const completed = (data || []).filter((t) => t.status === 'completed');

  return {
    completedRides: completed.length,
  };
};

// ── Drivers: Get online drivers ───────────────────────────────
export const getOnlineDrivers = async () => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, avatar_url, vehicle_type, plate_number, is_online')
    .eq('role', 'driver')
    .eq('status', 'approved')
    .eq('is_online', true);

  if (error) throw error;
  return data || [];
};

// ── Drivers: Set online status ────────────────────────────────
export const setDriverOnlineStatus = async (userId, isOnline) => {
  const { error } = await supabase
    .from('profiles')
    .update({ is_online: isOnline })
    .eq('id', userId);

  if (error) throw error;
};

// ── Drivers: Live availability summary ─────────────────────────
// Returns fleet-wide counts for the student home status box:
//   total     = approved drivers
//   online    = approved drivers currently online
//   onTrip    = online drivers on an accepted / in-progress trip
//   available = online drivers waiting for a passenger
export const getDriverAvailability = async () => {
  const [{ count: total }, { count: online }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'driver')
      .eq('status', 'approved'),
    supabase
      .from('profiles')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'driver')
      .eq('status', 'approved')
      .eq('is_online', true),
  ]);

  const { data: busyRows, error } = await supabase
    .from('trips')
    .select('driver_id')
    .in('status', ['accepted', 'in_progress'])
    .not('driver_id', 'is', null);

  if (error) throw error;

  const onlineBusy = new Set((busyRows || []).map((t) => t.driver_id)).size;
  const onTrip = Math.min(onlineBusy, online || 0);
  const available = Math.max(0, (online || 0) - onTrip);

  return { total: total || 0, online: online || 0, onTrip, available };
};

