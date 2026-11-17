// ─────────────────────────────────────────────────────────────
// Pure queue helpers for multi-passenger rides.
//
// Rules implemented here:
//   • Pick-up target = the driver's explicit choice. Acceptance order is only
//     a stable display fallback; it never selects a passenger automatically.
//   • Drop-off order = nearest drop-off first, recalculated from live GPS.
//   • Only the selected waiting passenger is the locked pick-up target.
//   • Seat numbers stay stable for the whole trip, even after a cancellation.
//
// No Supabase calls live in this file, so it is safe to unit test and safe
// to import from both driver and student screens.
// ─────────────────────────────────────────────────────────────

import { haversineDistance } from '../config/mapConfig';

export const ACTIVE_TRIP_STATUSES = ['accepted', 'in_progress'];

export const QUEUE_STATUS = {
  WAITING: 'waiting',
  HEADING: 'heading',
  ON_BOARD: 'on_board',
  DROPPED_OFF: 'dropped_off',
  CANCELLED: 'cancelled',
};

export const QUEUE_STATUS_LABELS = {
  [QUEUE_STATUS.WAITING]: 'Waiting for pick-up',
  [QUEUE_STATUS.HEADING]: 'Heading to pick-up',
  [QUEUE_STATUS.ON_BOARD]: 'On board',
  [QUEUE_STATUS.DROPPED_OFF]: 'Dropped off',
  [QUEUE_STATUS.CANCELLED]: 'Cancelled',
};

// Seven visually distinct colours for up to seven passengers.
// Index 0 is Passenger 1, index 6 is Passenger 7.
export const PASSENGER_COLORS = [
  '#f97316', // orange
  '#2563eb', // blue
  '#7c3aed', // violet
  '#db2777', // pink
  '#0891b2', // cyan
  '#ca8a04', // amber
  '#4d7c0f', // olive
];

export const getSeatColor = (seatNumber) => {
  const index = Math.max(0, (Number(seatNumber) || 1) - 1);
  return PASSENGER_COLORS[index % PASSENGER_COLORS.length];
};

export const isActiveTrip = (trip) =>
  Boolean(trip) && ACTIVE_TRIP_STATUSES.includes(trip.status);

const acceptanceTime = (trip) => {
  const raw = trip?.accepted_at || trip?.created_at;
  const time = raw ? new Date(raw).getTime() : NaN;
  return Number.isNaN(time) ? 0 : time;
};

// Old rows may not have accepted_at yet (before the SQL migration ran).
// created_at is the safe fallback, so ordering still works.
export const sortByAcceptance = (trips = []) =>
  [...trips].sort((a, b) => {
    const diff = acceptanceTime(a) - acceptanceTime(b);
    if (diff !== 0) return diff;
    return String(a?.id || '').localeCompare(String(b?.id || ''));
  });

/**
 * Map trip id -> seat number.
 *
 * Active passengers are numbered 1..N (N <= 7) from acceptance order so their
 * colours are always distinct. Cancelled/completed cards are numbered after
 * the active seats only for display; they no longer occupy a seat.
 */
export const assignSeatNumbers = (trips = []) => {
  const map = new Map();
  const active = sortByAcceptance((trips || []).filter(isActiveTrip));
  active.forEach((trip, index) => {
    if (trip?.id) map.set(trip.id, index + 1);
  });

  const inactive = sortByAcceptance(
    (trips || []).filter((trip) => trip?.id && !isActiveTrip(trip))
  );
  inactive.forEach((trip, index) => {
    map.set(trip.id, active.length + index + 1);
  });

  return map;
};

export const getSelectedPickupTrip = (trips = []) => {
  const selected = (trips || []).find(
    (trip) => trip?.status === 'accepted' && Boolean(trip?.pickup_selected_at)
  );
  return selected || null;
};

export const getPickupQueue = (trips = []) => {
  const accepted = (trips || []).filter((trip) => trip?.status === 'accepted');
  const selected = getSelectedPickupTrip(accepted);

  if (!selected) return sortByAcceptance(accepted);

  return [
    selected,
    ...sortByAcceptance(accepted.filter((trip) => trip.id !== selected.id)),
  ];
};

export const getOnBoardTrips = (trips = []) =>
  trips.filter((trip) => trip?.status === 'in_progress');

export const getPickupDistanceMeters = (trip, coords) => {
  if (
    !coords?.latitude ||
    !coords?.longitude ||
    trip?.pickup_lat == null ||
    trip?.pickup_lng == null
  ) {
    return null;
  }
  return (
    haversineDistance(
      coords.latitude,
      coords.longitude,
      trip.pickup_lat,
      trip.pickup_lng
    ) * 1000
  );
};

export const getDropoffDistanceMeters = (trip, coords) => {
  if (
    !coords?.latitude ||
    !coords?.longitude ||
    trip?.dest_lat == null ||
    trip?.dest_lng == null
  ) {
    return null;
  }
  return (
    haversineDistance(
      coords.latitude,
      coords.longitude,
      trip.dest_lat,
      trip.dest_lng
    ) * 1000
  );
};

/**
 * Nearest drop-off first. Passengers already on board are the only ones
 * eligible for drop-off. Order is recalculated whenever driverCoords change.
 */
export const getDropoffOrder = (trips = [], driverCoords = null) => {
  const onBoard = getOnBoardTrips(trips);
  if (!driverCoords) return sortByAcceptance(onBoard);

  return [...onBoard].sort((a, b) => {
    const aDistance = getDropoffDistanceMeters(a, driverCoords);
    const bDistance = getDropoffDistanceMeters(b, driverCoords);
    if (aDistance == null && bDistance == null) return 0;
    if (aDistance == null) return 1;
    if (bDistance == null) return -1;
    return aDistance - bDistance;
  });
};

export const getQueueStatus = (trip) => {
  if (!trip) return QUEUE_STATUS.WAITING;
  if (trip.status === 'cancelled') return QUEUE_STATUS.CANCELLED;
  if (trip.status === 'completed') return QUEUE_STATUS.DROPPED_OFF;
  if (trip.status === 'in_progress') return QUEUE_STATUS.ON_BOARD;
  if (trip.status === 'accepted') {
    return trip.pickup_selected_at
      ? QUEUE_STATUS.HEADING
      : QUEUE_STATUS.WAITING;
  }
  return QUEUE_STATUS.WAITING;
};

/**
 * A passenger is locked out of cancelling only when:
 *   • the driver currently has 2 or more active trips, AND
 *   • this trip is the driver's explicitly selected pick-up target.
 * With one passenger, no selection, or the feature flag off, this returns
 * false and the passenger keeps the normal cancel behaviour.
 */
export const isTripPickupLocked = (trip, driverTrips = []) => {
  if (!trip || trip.status !== 'accepted' || !trip.pickup_selected_at) {
    return false;
  }
  const activeTrips = (driverTrips || []).filter(isActiveTrip);
  if (activeTrips.length < 2) return false;
  return activeTrips.some(
    (activeTrip) =>
      activeTrip.id === trip.id && Boolean(activeTrip.pickup_selected_at)
  );
};

export const countActiveSeats = (trips = []) =>
  trips.reduce((total, trip) => {
    if (!isActiveTrip(trip)) return total;
    return total + (Number(trip.passengers) || 1);
  }, 0);

export const getProgressForStatus = (status) => {
  switch (status) {
    case QUEUE_STATUS.HEADING:
      return 0.1;
    case QUEUE_STATUS.ON_BOARD:
      return 0.5;
    case QUEUE_STATUS.DROPPED_OFF:
      return 1;
    case QUEUE_STATUS.CANCELLED:
      return 0.1;
    default:
      return 0;
  }
};
