// ─────────────────────────────────────────────────────────────
// Fixed road segments for the "same route" acceptance rule.
//
// The segment list is intentionally EMPTY. The developer must supply the
// approved Toledo City road segments; inventing road data would silently
// hide or allow the wrong ride requests.
//
// Expected shape (one entry per road corridor; points run in the
// "forward" direction):
// {
//   id: 'matab-ang-baron',
//   name: 'Matab-ang → Baron',
//   corridor: [
//     { latitude: 10.3680, longitude: 123.6210 },
//     { latitude: 10.3620, longitude: 123.6480 },
//     // ... points following the road, in forward order
//   ],
// }
//
// A trip is matched to the nearest corridor within ROUTE_MATCH_RADIUS_M.
// Its direction is derived from the pickup → destination bearing.
// ─────────────────────────────────────────────────────────────

export const TOLEDO_ROAD_SEGMENTS = [];

// How close a pickup point must be to a road corridor to count as "on" it.
export const ROUTE_MATCH_RADIUS_M = 120;

const EARTH_RADIUS_M = 6371000;
const toRad = (deg) => (deg * Math.PI) / 180;
const toDeg = (rad) => (rad * 180) / Math.PI;

// Local flat projection around a reference point. Accurate enough for a
// city-sized corridor and avoids pulling in a geometry dependency.
const projectPoint = (point, origin) => ({
  x: (point.longitude - origin.longitude) * Math.cos(toRad(origin.latitude)) * 111320,
  y: (point.latitude - origin.latitude) * 110540,
});

const distanceBetween = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

const bearingBetween = (from, to) => {
  const dLon = toRad(to.longitude - from.longitude);
  const lat1 = toRad(from.latitude);
  const lat2 = toRad(to.latitude);
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
};

const angularDifference = (a, b) => {
  const diff = Math.abs(a - b) % 360;
  return diff > 180 ? 360 - diff : diff;
};

// Distance from a point to a line segment, plus the bearing of that leg.
const distanceToLeg = (point, start, end, origin) => {
  const p = projectPoint(point, origin);
  const a = projectPoint(start, origin);
  const b = projectPoint(end, origin);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lengthSquared = dx * dx + dy * dy;

  let t = 0;
  if (lengthSquared > 0) {
    t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared;
    t = Math.max(0, Math.min(1, t));
  }

  const closest = { x: a.x + t * dx, y: a.y + t * dy };
  return {
    distance: distanceBetween(p, closest),
    bearing: bearingBetween(start, end),
  };
};

/**
 * Find the fixed road segment that a trip's pick-up falls on.
 * Returns null when the registry is empty or the pick-up is not on a road.
 */
export function deriveRouteSegment(trip) {
  if (!trip || trip.pickup_lat == null || trip.pickup_lng == null) return null;
  if (!TOLEDO_ROAD_SEGMENTS.length) return null;

  const pickup = { latitude: trip.pickup_lat, longitude: trip.pickup_lng };
  const destination = trip.dest_lat != null && trip.dest_lng != null
    ? { latitude: trip.dest_lat, longitude: trip.dest_lng }
    : null;
  const tripBearing = destination ? bearingBetween(pickup, destination) : null;

  let best = null;
  let bestScore = Infinity;

  for (const segment of TOLEDO_ROAD_SEGMENTS) {
    const corridor = segment?.corridor || [];
    if (corridor.length < 2) continue;

    let pickupMatch = null;
    let destinationMatch = null;

    for (let i = 0; i < corridor.length - 1; i += 1) {
      const pickupLeg = distanceToLeg(pickup, corridor[i], corridor[i + 1], pickup);
      if (!pickupMatch || pickupLeg.distance < pickupMatch.distance) {
        pickupMatch = pickupLeg;
      }

      if (destination) {
        const destinationLeg = distanceToLeg(
          destination,
          corridor[i],
          corridor[i + 1],
          pickup
        );
        if (!destinationMatch || destinationLeg.distance < destinationMatch.distance) {
          destinationMatch = destinationLeg;
        }
      }
    }

    if (!pickupMatch || pickupMatch.distance > ROUTE_MATCH_RADIUS_M) continue;
    if (destination && (!destinationMatch || destinationMatch.distance > ROUTE_MATCH_RADIUS_M)) {
      continue;
    }

    const score = pickupMatch.distance + (destinationMatch?.distance || 0);
    if (score >= bestScore) continue;

    const direction = tripBearing == null
      ? (segment.direction || 'forward')
      : angularDifference(pickupMatch.bearing, tripBearing) <= 90
        ? 'forward'
        : 'reverse';

    bestScore = score;
    best = {
      segmentId: segment.id,
      direction,
      segmentName: segment.name || segment.id,
      distanceMeters: Math.round(pickupMatch.distance),
    };
  }

  return best;
}

export const isRouteFilterEnabled = () => TOLEDO_ROAD_SEGMENTS.length > 0;

/**
 * The route rule is inert until real segment data is supplied.
 * With no data, every request is allowed (same behaviour as before).
 */
export function isRequestOnDriverRoute(requestTrip, driverTrips = []) {
  if (!isRouteFilterEnabled()) return true;

  const activeTrip = (driverTrips || []).find(
    (t) => t && (t.status === 'accepted' || t.status === 'in_progress')
  );
  if (!activeTrip) return true;

  const driverRoute = activeTrip.segment_id && activeTrip.direction
    ? { segmentId: activeTrip.segment_id, direction: activeTrip.direction }
    : deriveRouteSegment(activeTrip);
  if (!driverRoute?.segmentId) return true;

  const requestRoute = deriveRouteSegment(requestTrip);
  if (!requestRoute?.segmentId) return false;

  return (
    requestRoute.segmentId === driverRoute.segmentId &&
    requestRoute.direction === driverRoute.direction
  );
}
