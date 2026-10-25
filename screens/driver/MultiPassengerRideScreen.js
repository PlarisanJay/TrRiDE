import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Linking,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, ROUNDED, SHADOWS, SPACING, TYPOGRAPHY } from '../../theme';
import {
  TOLEDO_CITY,
  fetchRoute,
  formatDistanceText,
  formatDurationText,
  haversineDistance,
} from '../../config/mapConfig';
import MapPreview from '../../components/MapPreview';
import UserAvatar from '../../components/UserAvatar';
import CancelRideModal from '../../components/CancelRideModal';
import MultiPassengerQueue from '../../components/driver/MultiPassengerQueue';
import PassengerProgressBar from '../../components/driver/PassengerProgressBar';
import { useWideWeb, wideMapStyles } from '../../lib/webLayout';
import { alertDialog, notifyDialog } from '../../lib/dialog';
import { ENABLE_MULTI_PASSENGER_RIDE } from '../../config/features';
import { supabase } from '../../config/supabase';
import { getProfileById } from '../../data/auth';
import {
  cancelTripWithReason,
  completeTrip,
  startTrip,
  subscribeToDriverTrips,
} from '../../data/trips';
import { getDriverMultiPassengerTrips } from '../../data/multiPassenger';
import { sendLocalNotification } from '../../data/pushNotifications';
import {
  QUEUE_STATUS,
  QUEUE_STATUS_LABELS,
  assignSeatNumbers,
  countActiveSeats,
  getDropoffDistanceMeters,
  getDropoffOrder,
  getOnBoardTrips,
  getPickupQueue,
  getProgressForStatus,
  getQueueStatus,
  getSeatColor,
  isActiveTrip,
  sortByAcceptance,
} from '../../data/rideQueue';

function FeatureDisabled() {
  return (
    <View style={styles.centered}>
      <MaterialIcons name="lock" size={40} color={COLORS.outline} />
      <Text style={styles.emptyTitle}>Multi-passenger rides are disabled</Text>
      <Text style={styles.emptySub}>
        Set EXPO_PUBLIC_ENABLE_MULTI_PASSENGER_RIDE=true to enable this screen.
      </Text>
    </View>
  );
}

/**
 * One screen for every accepted passenger:
 *   • combined map with colour-coded pick-ups and drop-offs
 *   • queue with per-passenger status
 *   • bottom progress bars
 *   • live driver location broadcast to every active trip channel
 *
 * Single-passenger behaviour lives in CurrentTripScreen and is not used here.
 */
export default function MultiPassengerRideScreen(props) {
  if (!ENABLE_MULTI_PASSENGER_RIDE) return <FeatureDisabled />;
  return <MultiPassengerRideScreenInner {...props} />;
}

function MultiPassengerRideScreenInner({
  userProfile,
  onBack,
  onAllCompleted,
  onNavigate,
}) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [driverCoords, setDriverCoords] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistText, setRouteDistText] = useState('');
  const [routeDurText, setRouteDurText] = useState('');
  const [students, setStudents] = useState({});
  const [actingId, setActingId] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const mapRef = useRef(null);
  const tripsRef = useRef([]);
  const completedRef = useRef([]);
  const studentsRef = useRef({});
  const channelsRef = useRef({});
  const routeAnchorRef = useRef(null);
  const focusRef = useRef(null);
  const isWideWeb = useWideWeb();

  const loadTrips = useCallback(
    async ({ silent = false } = {}) => {
      if (!userProfile?.id) return [];
      if (!silent) setLoading(true);
      try {
        const next = await getDriverMultiPassengerTrips(userProfile.id);
        const hasActive = next.some(isActiveTrip);

        // Keep the "Dropped off" cards visible for the rest of this queue so
        // the driver sees the checked/muted state and the animation completes.
        // They are local-only; completing the whole queue leaves this screen.
        if (!hasActive) {
          completedRef.current = [];
        }
        const completedToKeep = hasActive
          ? completedRef.current.filter(
              (done) => !next.some((trip) => trip.id === done.id)
            )
          : [];

        const merged = sortByAcceptance([...next, ...completedToKeep]);
        tripsRef.current = merged;
        setTrips(merged);
        return merged;
      } catch (error) {
        console.warn('Could not load multi-passenger trips:', error?.message);
        return tripsRef.current;
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [userProfile?.id]
  );

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  // New accepts, pick-ups, drop-offs and passenger cancellations all arrive here.
  useEffect(() => {
    if (!userProfile?.id) return undefined;
    const unsubscribe = subscribeToDriverTrips(userProfile.id, () => {
      loadTrips({ silent: true });
    });
    const poll = setInterval(() => loadTrips({ silent: true }), 15000);
    return () => {
      if (unsubscribe) unsubscribe();
      clearInterval(poll);
    };
  }, [userProfile?.id, loadTrips]);

  // Load passenger names/avatars once per student.
  const studentIdsKey = useMemo(
    () =>
      [...new Set(trips.map((trip) => trip.student_id).filter(Boolean))]
        .sort()
        .join('|'),
    [trips]
  );

  useEffect(() => {
    if (!studentIdsKey) return undefined;
    let mounted = true;

    studentIdsKey.split('|').forEach((studentId) => {
      if (!studentId || studentsRef.current[studentId]) return;
      studentsRef.current[studentId] = { loading: true };
      getProfileById(studentId)
        .then((profile) => {
          if (profile && mounted) {
            studentsRef.current[studentId] = profile;
            setStudents((prev) => ({ ...prev, [studentId]: profile }));
          }
        })
        .catch(() => {
          delete studentsRef.current[studentId];
        });
    });

    return () => {
      mounted = false;
    };
  }, [studentIdsKey]);

  const seatNumbers = useMemo(() => assignSeatNumbers(trips), [trips]);
  const activeTrips = useMemo(() => trips.filter(isActiveTrip), [trips]);
  const pickupQueue = useMemo(() => getPickupQueue(trips), [trips]);
  const dropoffOrder = useMemo(
    () => getDropoffOrder(getOnBoardTrips(trips), driverCoords),
    [trips, driverCoords]
  );
  const nearestDropoffId = dropoffOrder[0]?.id || null;
  const focusTrip = pickupQueue[0] || dropoffOrder[0] || null;
  const focusPoint = focusTrip
    ? focusTrip.status === 'accepted'
      ? { latitude: focusTrip.pickup_lat, longitude: focusTrip.pickup_lng }
      : { latitude: focusTrip.dest_lat, longitude: focusTrip.dest_lng }
    : null;
  const totalSeats = useMemo(() => countActiveSeats(trips), [trips]);

  useEffect(() => {
    focusRef.current = focusTrip;
  }, [focusTrip]);

  // Notify the driver in-app and locally when a passenger cancels.
  // The push notification is already sent by cancelTripWithReason.
  const cancelledSeenRef = useRef(new Set());
  const cancelledInitializedRef = useRef(false);

  useEffect(() => {
    const cancelled = trips.filter((trip) => trip.status === 'cancelled');

    if (!cancelledInitializedRef.current) {
      if (trips.length > 0) {
        cancelled.forEach((trip) => cancelledSeenRef.current.add(trip.id));
        cancelledInitializedRef.current = true;
      }
      return;
    }

    cancelled.forEach((trip) => {
      if (cancelledSeenRef.current.has(trip.id)) return;
      cancelledSeenRef.current.add(trip.id);
      const name = students[trip.student_id]?.full_name || 'A passenger';
      const message = `${name} cancelled the ride.`;
      notifyDialog({ title: 'Passenger Cancelled', message });
      sendLocalNotification('Passenger cancelled', message, {
        tripId: trip.id,
        type: 'trip_cancelled',
      });
    });
  }, [trips, students]);

  const broadcastLocation = useCallback((latitude, longitude) => {
    const currentTrips = tripsRef.current;
    Object.entries(channelsRef.current).forEach(([tripId, channel]) => {
      const trip = currentTrips.find((item) => item.id === tripId);
      if (!trip || !isActiveTrip(trip)) return;

      const isFocus = focusRef.current?.id === tripId;
      const statusText =
        trip.status === 'in_progress'
          ? 'DRIVING'
          : isFocus
            ? 'EN ROUTE'
            : 'STANDBY';

      try {
        channel.send({
          type: 'broadcast',
          event: 'driver_location',
          payload: { latitude, longitude, statusText },
        });
      } catch (error) {
        // A closed channel must never stop the location watcher.
      }
    });
  }, []);

  const activeTripIdsKey = useMemo(
    () => activeTrips.map((trip) => trip.id).sort().join('|'),
    [activeTrips]
  );

  // One broadcast channel per active trip, so every passenger's tracking
  // screen keeps receiving the driver's live location.
  useEffect(() => {
    if (!activeTripIdsKey) {
      channelsRef.current = {};
      return undefined;
    }

    const channels = {};
    activeTripIdsKey.split('|').forEach((tripId) => {
      if (!tripId) return;
      const channel = supabase.channel(`trip-loc-${tripId}`, {
        config: { broadcast: { self: false } },
      });
      channel.subscribe();
      channels[tripId] = channel;
    });
    channelsRef.current = channels;

    return () => {
      Object.values(channels).forEach((channel) => {
        try {
          supabase.removeChannel(channel);
        } catch (error) {}
      });
      channelsRef.current = {};
    };
  }, [activeTripIdsKey]);

  // Live GPS. Same accuracy settings as CurrentTripScreen, but broadcast to
  // every active passenger instead of one.
  useEffect(() => {
    let locationSubscription = null;
    let mounted = true;

    const startWatching = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync().catch(
          () => ({ status: 'denied' })
        );
        if (status !== 'granted') return;

        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }).catch(() => null);

        if (initial?.coords && mounted) {
          const coords = {
            latitude: initial.coords.latitude,
            longitude: initial.coords.longitude,
          };
          setDriverCoords(coords);
          broadcastLocation(coords.latitude, coords.longitude);
        }

        locationSubscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            distanceInterval: 10,
            timeInterval: 4000,
          },
          (newLocation) => {
            if (!newLocation?.coords || !mounted) return;
            const coords = {
              latitude: newLocation.coords.latitude,
              longitude: newLocation.coords.longitude,
            };
            setDriverCoords(coords);
            broadcastLocation(coords.latitude, coords.longitude);
          }
        ).catch(() => null);
      } catch (error) {
        console.warn('Multi-passenger location tracking error:', error);
      }
    };

    startWatching();

    return () => {
      mounted = false;
      if (locationSubscription?.remove) locationSubscription.remove();
    };
  }, [broadcastLocation]);

  // Fallback position when GPS is unavailable, matching CurrentTripScreen.
  useEffect(() => {
    if (driverCoords) return;
    const fallback = tripsRef.current.find(
      (trip) => isActiveTrip(trip) && trip.pickup_lat != null
    );
    if (fallback) {
      setDriverCoords({
        latitude: fallback.pickup_lat + 0.003,
        longitude: fallback.pickup_lng - 0.002,
      });
    }
  }, [trips, driverCoords]);

  // Route line for the current focus: next pick-up, or nearest drop-off.
  useEffect(() => {
    if (!focusTrip) {
      setRouteCoordinates([]);
      setRouteDistText('');
      setRouteDurText('');
      routeAnchorRef.current = null;
      return undefined;
    }

    const isPickupLeg = focusTrip.status === 'accepted';
    const to = isPickupLeg
      ? focusTrip.pickup_lat != null
        ? { latitude: focusTrip.pickup_lat, longitude: focusTrip.pickup_lng }
        : null
      : focusTrip.dest_lat != null
        ? { latitude: focusTrip.dest_lat, longitude: focusTrip.dest_lng }
        : null;

    const from =
      driverCoords ||
      (focusTrip.pickup_lat != null
        ? { latitude: focusTrip.pickup_lat, longitude: focusTrip.pickup_lng }
        : null);

    if (!from || !to) return undefined;

    const anchor = routeAnchorRef.current;
    const movedMeters = anchor
      ? haversineDistance(anchor.lat, anchor.lng, from.latitude, from.longitude) * 1000
      : Infinity;

    if (
      anchor &&
      anchor.focusId === focusTrip.id &&
      anchor.isPickupLeg === isPickupLeg &&
      movedMeters < 120
    ) {
      return undefined;
    }

    routeAnchorRef.current = {
      focusId: focusTrip.id,
      isPickupLeg,
      lat: from.latitude,
      lng: from.longitude,
    };

    let mounted = true;
    fetchRoute(from, to)
      .then((result) => {
        if (!mounted || !result) return;
        setRouteCoordinates(result.coordinates || []);
        setRouteDistText(result.distanceText || '');
        setRouteDurText(result.durationText || '');
      })
      .catch(() => {
        if (!mounted) return;
        const distanceKm = haversineDistance(
          from.latitude,
          from.longitude,
          to.latitude,
          to.longitude
        );
        setRouteDistText(formatDistanceText(Math.round(distanceKm * 1000)));
        setRouteDurText(formatDurationText(Math.max(1, Math.round(distanceKm * 3))));
      });

    return () => {
      mounted = false;
    };
  }, [
    focusTrip?.id,
    focusTrip?.status,
    driverCoords?.latitude,
    driverCoords?.longitude,
  ]);

  const markers = useMemo(() => {
    const list = [];

    trips.forEach((trip) => {
      if (!isActiveTrip(trip)) return; // cancelled/dropped-off markers leave the map

      const seat = seatNumbers.get(trip.id) || 1;
      const color = getSeatColor(seat);

      if (trip.pickup_lat != null && trip.pickup_lng != null) {
        list.push({
          id: `pickup-${trip.id}`,
          coordinate: {
            latitude: trip.pickup_lat,
            longitude: trip.pickup_lng,
          },
          type: 'pickup',
          color,
          customColor: color,
          badgeColor: color,
          badgeText: `P${seat} PICK`,
          label: `P${seat} Pick-up`,
        });
      }

      if (trip.dest_lat != null && trip.dest_lng != null) {
        list.push({
          id: `dest-${trip.id}`,
          coordinate: {
            latitude: trip.dest_lat,
            longitude: trip.dest_lng,
          },
          type: 'destination',
          color,
          customColor: color,
          badgeColor: color,
          badgeText: `P${seat} DROP`,
          label: `P${seat} Drop-off`,
        });
      }
    });

    if (driverCoords) {
      list.push({
        id: 'driver',
        coordinate: driverCoords,
        type: 'driver',
        label: 'You (Driver)',
        statusText: focusTrip?.status === 'in_progress' ? 'DRIVING' : 'EN ROUTE',
        color: '#16a34a',
      });
    }

    return list;
  }, [trips, driverCoords, seatNumbers, focusTrip?.status]);

  useEffect(() => {
    if (!markers.length) return undefined;
    const timer = setTimeout(() => mapRef.current?.fitBounds(), 350);
    return () => clearTimeout(timer);
  }, [markers.length, routeCoordinates.length]);

  const handleFitBounds = useCallback(() => {
    mapRef.current?.fitBounds();
  }, []);

  const handleRecenter = useCallback(() => {
    if (driverCoords) {
      mapRef.current?.recenter(driverCoords.latitude, driverCoords.longitude);
    } else if (focusTrip?.pickup_lat != null) {
      mapRef.current?.recenter(focusTrip.pickup_lat, focusTrip.pickup_lng);
    }
  }, [driverCoords, focusTrip?.pickup_lat, focusTrip?.pickup_lng]);

  const handlePickup = async (trip) => {
    if (actingId) return;

    const current = getPickupQueue(tripsRef.current)[0];
    if (!current || current.id !== trip.id) {
      alertDialog({
        title: 'Pick-up Order',
        message:
          'The app decides pick-up order by acceptance time. Finish the current pick-up first.',
      });
      return;
    }

    setActingId(trip.id);
    try {
      await startTrip(trip.id);
      await loadTrips({ silent: true });
    } catch (error) {
      alertDialog({
        title: 'Cannot Pick Up',
        message: error?.message || 'Could not start this passenger trip.',
      });
    } finally {
      setActingId(null);
    }
  };

  const handleDropoff = async (trip) => {
    if (actingId) return;

    // Drop-off order is decided by the app (nearest destination first).
    // With GPS unavailable, acceptance order is used, but it is still locked.
    const nextDropoff = dropoffOrder[0];
    if (!nextDropoff || nextDropoff.id !== trip.id) {
      alertDialog({
        title: 'Drop-off Order',
        message:
          'The app drops off the nearest passenger first. The order updates automatically as you drive.',
      });
      return;
    }

    setActingId(trip.id);
    try {
      const completedTrip = await completeTrip(trip.id);
      if (completedTrip?.id) {
        completedRef.current = [
          ...completedRef.current.filter((item) => item.id !== completedTrip.id),
          completedTrip,
        ];
      }
      const remaining = tripsRef.current.filter(
        (item) => item.id !== trip.id && isActiveTrip(item)
      );
      await loadTrips({ silent: true });
      if (remaining.length === 0) {
        await notifyDialog({
          title: 'Congratulations!',
          message: 'All passengers have been dropped off. Great job!',
        });
        onAllCompleted?.();
      }
    } catch (error) {
      alertDialog({
        title: 'Cannot Complete',
        message: error?.message || 'Could not complete this passenger trip.',
      });
    } finally {
      setActingId(null);
    }
  };

  const handleCancelPress = (trip) => {
    if (trip.status === 'in_progress') {
      alertDialog({
        title: 'Ride in Progress',
        message:
          'This passenger is already on board. Complete the drop-off instead of cancelling.',
      });
      return;
    }
    setCancelTarget(trip);
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async (reason) => {
    if (!cancelTarget) return;

    const targetId = cancelTarget.id;
    setCancelling(true);
    try {
      // This cancellation is the driver's own action; do not show the
      // "passenger cancelled" alert for it.
      cancelledSeenRef.current.add(targetId);
      const remaining = tripsRef.current.filter(
        (trip) => trip.id !== targetId && isActiveTrip(trip)
      );
      await cancelTripWithReason({ tripId: targetId, role: 'driver', reason });
      setShowCancelModal(false);
      setCancelTarget(null);
      await loadTrips({ silent: true });
      if (remaining.length === 0) {
        await notifyDialog({
          title: 'Congratulations!',
          message: 'All passengers have been dropped off. Great job!',
        });
        onAllCompleted?.();
      }
    } catch (error) {
      // The cancellation did not happen, so allow a later real-time event
      // for this trip to raise the passenger-cancelled alert.
      cancelledSeenRef.current.delete(targetId);
      alertDialog({
        title: 'Cannot Cancel',
        message: error?.message || 'Could not cancel this passenger trip.',
      });
    } finally {
      setCancelling(false);
    }
  };

  const handleCall = (trip) => {
    const phone = students[trip.student_id]?.phone;
    if (!phone) {
      alertDialog({
        title: 'No Phone Number',
        message: 'This passenger has not provided a phone number.',
      });
      return;
    }
    Linking.openURL(`tel:${phone}`).catch(() => {
      alertDialog({ title: 'Cannot Call', message: 'Unable to open phone dialer.' });
    });
  };

  const handleChat = (trip) => {
    onNavigate?.('Messages', { tripId: trip.id });
  };

  const dropoffDistances = useMemo(() => {
    const map = {};
    dropoffOrder.forEach((trip) => {
      const distance = getDropoffDistanceMeters(trip, driverCoords);
      if (distance != null) map[trip.id] = formatDistanceText(Math.round(distance));
    });
    return map;
  }, [dropoffOrder, driverCoords]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.loadingText}>Loading all passengers...</Text>
      </View>
    );
  }

  if (!trips.length) {
    return (
      <View style={styles.centered}>
        <MaterialIcons name="groups" size={48} color={COLORS.outlineVariant} />
        <Text style={styles.emptyTitle}>No multi-passenger trip right now</Text>
        <Text style={styles.emptySub}>
          This screen opens automatically once you have two or more accepted passengers.
        </Text>
        <TouchableOpacity style={styles.backLink} onPress={onBack} activeOpacity={0.75}>
          <MaterialIcons name="arrow-back" size={18} color={COLORS.primary} />
          <Text style={styles.backLinkText}>Back to dashboard</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const focusSeat = focusTrip ? seatNumbers.get(focusTrip.id) || 1 : null;
  const focusLabel = focusTrip
    ? focusTrip.status === 'accepted'
      ? `Next: pick up Passenger ${focusSeat}`
      : `Next: drop off Passenger ${focusSeat}`
    : 'All active passengers served';

  return (
    <View style={styles.container}>
      <View style={[styles.mapSection, isWideWeb && wideMapStyles.mapSection]}>
        <MapPreview
          ref={mapRef}
          region={{
            latitude: focusPoint?.latitude || TOLEDO_CITY.latitude,
            longitude: focusPoint?.longitude || TOLEDO_CITY.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          markers={markers}
          routeCoordinates={routeCoordinates}
          durationText={routeDurText || '30 MIN'}
          scrollEnabled
        />

        <View
          style={[
            styles.floatingHeaderArea,
            isWideWeb && wideMapStyles.floatingHeaderArea,
          ]}
          pointerEvents="box-none"
        >
          <TouchableOpacity
            style={styles.floatingBackBtn}
            activeOpacity={0.85}
            onPress={onBack}
          >
            <MaterialIcons name="arrow-back" size={22} color="#1e293b" />
          </TouchableOpacity>

          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>
              {activeTrips.length} ACTIVE • {totalSeats}/7 SEATS
            </Text>
          </View>

          <TouchableOpacity
            style={styles.floatingAvatarBtn}
            activeOpacity={0.85}
            onPress={() => onNavigate?.('Profile')}
          >
            <UserAvatar
              uri={userProfile?.avatar_url}
              name={userProfile?.full_name || 'Driver'}
              size={38}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.floatingMapActions}>
          <TouchableOpacity
            style={styles.mapActionBtn}
            activeOpacity={0.8}
            onPress={handleRecenter}
          >
            <MaterialIcons name="near-me" size={20} color="#16a34a" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.mapActionBtn}
            activeOpacity={0.8}
            onPress={handleFitBounds}
          >
            <MaterialIcons name="crop-free" size={20} color="#1e293b" />
          </TouchableOpacity>
        </View>
      </View>

      <View
        style={[
          styles.sheetContainer,
          isWideWeb && wideMapStyles.sheetContainer,
        ]}
      >
        <View style={styles.dragHandleTouchArea}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={[styles.summaryCard, SHADOWS.diffusion]}>
            <View style={styles.summaryTextWrap}>
              <Text style={styles.summaryTitle}>{focusLabel}</Text>
              <Text style={styles.summarySub}>
                {routeDistText
                  ? `📍 ${routeDistText}`
                  : 'Calculating route...'}
              </Text>
            </View>
            <View style={styles.seatCountBadge}>
              <MaterialIcons name="people" size={15} color={COLORS.primary} />
              <Text style={styles.seatCountText}>
                {totalSeats}/7
              </Text>
            </View>
          </View>

          <Text style={styles.sectionTitle}>Ride Queue</Text>
          <MultiPassengerQueue
            trips={trips}
            seatNumbers={seatNumbers}
            pickupQueue={pickupQueue}
            nearestDropoffId={nearestDropoffId}
            students={students}
            dropoffDistances={dropoffDistances}
            actingId={actingId}
            cancellingId={cancelling ? cancelTarget?.id : null}
            onPickup={handlePickup}
            onDropoff={handleDropoff}
            onCancel={handleCancelPress}
            onCall={handleCall}
            onChat={handleChat}
          />

          <Text style={styles.sectionTitle}>Trip Progress</Text>
          <View style={[styles.progressCard, SHADOWS.diffusion]}>
            {trips.map((trip) => {
              const seat = seatNumbers.get(trip.id) || 1;
              const status = getQueueStatus(trip, pickupQueue);
              return (
                <PassengerProgressBar
                  key={trip.id}
                  seatNumber={seat}
                  name={students[trip.student_id]?.full_name || `Passenger ${seat}`}
                  statusLabel={QUEUE_STATUS_LABELS[status]}
                  progress={getProgressForStatus(status)}
                  color={getSeatColor(seat)}
                  cancelled={status === QUEUE_STATUS.CANCELLED}
                  completed={status === QUEUE_STATUS.DROPPED_OFF}
                />
              );
            })}
          </View>

          <Text style={styles.footerNote}>
            Pick-up order follows acceptance time. Drop-off order follows the nearest
            destination and updates as you drive. Live navigation stays active while the
            queue changes.
          </Text>
        </ScrollView>
      </View>

      <CancelRideModal
        visible={showCancelModal}
        role="driver"
        tripStatus={cancelTarget?.status}
        onClose={() => {
          setShowCancelModal(false);
          setCancelTarget(null);
        }}
        onConfirm={handleConfirmCancel}
        loading={cancelling}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: SPACING.lg,
    backgroundColor: '#ffffff',
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
  },
  emptyTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    textAlign: 'center',
  },
  emptySub: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  backLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  backLinkText: {
    ...TYPOGRAPHY.button,
    fontSize: 13,
    color: COLORS.primary,
  },
  mapSection: {
    flex: 0.85,
    minHeight: 250,
    position: 'relative',
    backgroundColor: '#f1f5f9',
  },
  floatingHeaderArea: {
    position: 'absolute',
    top: Platform.OS === 'android' ? 14 : 10,
    left: 16,
    right: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 50,
  },
  floatingBackBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  headerBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  headerBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.secondary,
    letterSpacing: 0.3,
  },
  floatingAvatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 4,
  },
  floatingMapActions: {
    position: 'absolute',
    right: 16,
    bottom: 28,
    gap: 10,
    zIndex: 50,
  },
  mapActionBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.14,
    shadowRadius: 4,
    elevation: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  sheetContainer: {
    flex: 1.15,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 8,
    zIndex: 20,
  },
  dragHandleTouchArea: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 4,
    width: '100%',
  },
  dragHandle: {
    width: 50,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#cbd5e1',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 36,
    gap: 10,
  },
  summaryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.sm,
    backgroundColor: '#f8fbff',
    borderWidth: 1,
    borderColor: '#dbeafe',
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  summaryTextWrap: {
    flex: 1,
  },
  summaryTitle: {
    ...TYPOGRAPHY.sectionTitle,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.onSurface,
  },
  summarySub: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  seatCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  seatCountText: {
    fontSize: 12,
    fontWeight: '800',
    color: COLORS.primary,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.onSurface,
    marginTop: 4,
  },
  progressCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 6,
  },
  footerNote: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
    lineHeight: 16,
    marginTop: 2,
    marginBottom: 8,
  },
});
