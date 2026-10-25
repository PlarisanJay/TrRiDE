import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Linking, Platform } from 'react-native';
import { alertDialog, notifyDialog } from '../../lib/dialog';
import { MaterialIcons } from '@expo/vector-icons';
import {
  COLORS,
  TYPOGRAPHY,
  SPACING,
  ROUNDED,
  ELEVATION,
  INK,
  CANVAS,
  ACCENT,
  BORDERS,
} from '../../theme';
import { TOLEDO_CITY, fetchRoute, haversineDistance, formatDistanceText, formatDurationText } from '../../config/mapConfig';
import { getTripById, subscribeToTrip, cancelTripWithReason } from '../../data/trips';
import { ENABLE_MULTI_PASSENGER_RIDE } from '../../config/features';
import { isPassengerCancelLocked } from '../../data/multiPassenger';
import { getProfileById } from '../../data/auth';
import { supabase } from '../../config/supabase';
import MapPreview from '../../components/MapPreview';
import { useWideWeb, wideMapStyles } from '../../lib/webLayout';
import UserAvatar from '../../components/UserAvatar';
import CancelRideModal from '../../components/CancelRideModal';

export default function TrackDriverScreen({ userProfile, tripId, onCancelTrip, onNavigate }) {
  const [trip, setTrip] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistText, setRouteDistText] = useState('');
  const [routeDurText, setRouteDurText] = useState('');

  // Live driver location & status
  const [driverCoords, setDriverCoords] = useState(null);
  const [driverStatusText, setDriverStatusText] = useState('ON THE WAY');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelLocked, setCancelLocked] = useState(false);

  const mapRef = useRef(null);
  const isWideWeb = useWideWeb();
  const hasHandledCancelRef = useRef(false);

  useEffect(() => {
    if (!tripId) { setLoading(false); return; }

    let unsub;
    (async () => {
      try {
        const t = await getTripById(tripId);
        setTrip(t);
        if (t?.driver_id) {
          const d = await getProfileById(t.driver_id);
          setDriver(d);
        }
      } catch (e) {}
      setLoading(false);
    })();

    unsub = subscribeToTrip(tripId, async (updated) => {
      setTrip(updated);
      if (updated?.driver_id && !driver) {
        const d = await getProfileById(updated.driver_id);
        setDriver(d);
      }
      if (updated?.status === 'cancelled' && !hasHandledCancelRef.current) {
        hasHandledCancelRef.current = true;
        setShowCancelModal(false);
        await notifyDialog({
          title: 'Ride Cancelled',
          message:
            'This ride has been cancelled and terminated.' +
            (updated.notes ? `\n\n${updated.notes}` : ''),
        });
        onCancelTrip();
      }
    });

    return () => { if (unsub) unsub(); };
  }, [tripId]);

  // Supabase real-time broadcast listener for driver GPS
  useEffect(() => {
    if (!tripId) return;
    const channel = supabase.channel(`trip-loc-${tripId}`);
    channel.on('broadcast', { event: 'driver_location' }, (payload) => {
      if (payload?.payload?.latitude && payload?.payload?.longitude) {
        setDriverCoords({
          latitude: payload.payload.latitude,
          longitude: payload.payload.longitude,
        });
        if (payload.payload.statusText) {
          setDriverStatusText(payload.payload.statusText);
        }
      }
    }).subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [tripId]);

  // Fallback / initial driver position based on trip status
  useEffect(() => {
    if (!trip?.pickup_lat || !trip?.pickup_lng) return;

    if (!driverCoords && trip.driver_id) {
      if (trip.status === 'accepted') {
        // Driver approaching pickup (~400m offset)
        setDriverCoords({
          latitude: trip.pickup_lat + 0.0032,
          longitude: trip.pickup_lng - 0.0025,
        });
        setDriverStatusText('ON THE WAY');
      } else if (trip.status === 'in_progress') {
        // Driver between pickup and destination
        const midLat = trip.dest_lat ? (trip.pickup_lat + trip.dest_lat) / 2 : trip.pickup_lat;
        const midLng = trip.dest_lng ? (trip.pickup_lng + trip.dest_lng) / 2 : trip.pickup_lng;
        setDriverCoords({
          latitude: midLat,
          longitude: midLng,
        });
        setDriverStatusText('DRIVING');
      }
    }
  }, [trip?.pickup_lat, trip?.pickup_lng, trip?.dest_lat, trip?.dest_lng, trip?.status, trip?.driver_id, driverCoords]);

  // Route calculation
  useEffect(() => {
    let isMounted = true;
    if (trip?.pickup_lat && trip?.dest_lat) {
      const p = { latitude: trip.pickup_lat, longitude: trip.pickup_lng };
      const d = { latitude: trip.dest_lat, longitude: trip.dest_lng };
      fetchRoute(p, d).then((res) => {
        if (isMounted && res) {
          setRouteCoordinates(res.coordinates || []);
          setRouteDistText(res.distanceText || '');
          setRouteDurText(res.durationText || '');
        }
      }).catch(() => {
        if (isMounted) {
          const distKm = haversineDistance(trip.pickup_lat, trip.pickup_lng, trip.dest_lat, trip.dest_lng);
          setRouteDistText(formatDistanceText(Math.round(distKm * 1000)));
          const estMins = Math.max(1, Math.round(distKm * 3));
          setRouteDurText(formatDurationText(estMins));
        }
      });
    }
    return () => { isMounted = false; };
  }, [trip?.pickup_lat, trip?.pickup_lng, trip?.dest_lat, trip?.dest_lng]);

  // Map markers: Driver, Pickup, Destination
  const markers = useMemo(() => {
    const list = [];
    if (trip?.pickup_lat && trip?.pickup_lng) {
      list.push({
        id: 'pickup',
        coordinate: { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
        type: 'pickup',
        label: 'Pick-up',
        color: ACCENT.orange,
      });
    }
    if (trip?.dest_lat && trip?.dest_lng) {
      list.push({
        id: 'destination',
        coordinate: { latitude: trip.dest_lat, longitude: trip.dest_lng },
        type: 'destination',
        label: 'Drop-off',
        color: ACCENT.blue,
      });
    }
    if (driver && driverCoords && trip?.status !== 'cancelled' && trip?.status !== 'completed') {
      list.push({
        id: 'driver',
        coordinate: driverCoords,
        type: 'driver',
        label: driver.full_name || 'Driver',
        statusText: driverStatusText || (trip?.status === 'in_progress' ? 'DRIVING' : 'ON THE WAY'),
        color: ACCENT.green,
      });
    }
    return list;
  }, [trip, driver, driverCoords, driverStatusText]);

  // Auto-fit to show all markers (driver, pickup, destination) without manual drag or zoom
  useEffect(() => {
    if (markers.length > 0) {
      const timer = setTimeout(() => {
        mapRef.current?.fitBounds();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [markers.length, routeCoordinates.length]);

  const handleFitBounds = useCallback(() => {
    mapRef.current?.fitBounds();
  }, []);

  const handleRecenter = useCallback(() => {
    if (driverCoords) {
      mapRef.current?.recenter(driverCoords.latitude, driverCoords.longitude);
    } else if (trip?.pickup_lat) {
      mapRef.current?.recenter(trip.pickup_lat, trip.pickup_lng);
    }
  }, [driverCoords, trip?.pickup_lat, trip?.pickup_lng]);

  // Keep the cancel button visibly disabled when this passenger is the
  // current pick-up target of a multi-passenger trip. Feature-flag gated.
  useEffect(() => {
    let mounted = true;
    if (
      !ENABLE_MULTI_PASSENGER_RIDE ||
      !trip ||
      trip.status !== 'accepted' ||
      !trip.driver_id
    ) {
      setCancelLocked(false);
      return () => {
        mounted = false;
      };
    }

    const checkLock = () => {
      isPassengerCancelLocked(trip)
        .then((locked) => {
          if (mounted) setCancelLocked(Boolean(locked));
        })
        .catch(() => {
          if (mounted) setCancelLocked(false);
        });
    };

    checkLock();
    // Other passengers' trips are not readable under RLS, so refresh the
    // server-computed lock while this passenger is waiting.
    const pollTimer = setInterval(checkLock, 15000);

    return () => {
      mounted = false;
      clearInterval(pollTimer);
    };
  }, [trip?.id, trip?.status, trip?.driver_id, trip?.accepted_at]);

  const handleCall = () => {
    if (driver?.phone) {
      Linking.openURL(`tel:${driver.phone}`).catch(() => {
        alertDialog({ title: 'Cannot Call', message: 'Unable to open phone dialer.' });
      });
    } else {
      alertDialog({ title: 'No Phone Number', message: 'The driver has not provided a phone number.' });
    }
  };

  const handleCancelPress = async () => {
    if (trip?.status === 'in_progress') {
      alertDialog({
        title: 'Ride in Progress',
        message:
          'This ride is currently active and in progress. Rides cannot be cancelled while on the road. Please reach your destination safely.',
      });
      return;
    }

    // Multi-passenger rule: the passenger currently being picked up cannot
    // cancel. Other passengers further down the queue can still cancel.
    if (ENABLE_MULTI_PASSENGER_RIDE && trip) {
      try {
        const locked = await isPassengerCancelLocked(trip);
        if (locked) {
          setCancelLocked(true);
          alertDialog({
            title: 'Pick-up in Progress',
            message:
              'Your driver is already heading to pick you up, so this ride can no longer be cancelled.',
          });
          return;
        }
      } catch (e) {
        // If the lock check fails, keep the normal cancel flow available.
      }
    }

    setShowCancelModal(true);
  };

  const handleConfirmCancel = async (reason) => {
    setCancelling(true);
    try {
      hasHandledCancelRef.current = true;
      await cancelTripWithReason({
        tripId,
        role: 'student',
        reason,
      });
      setShowCancelModal(false);
      await notifyDialog({
        title: 'Ride Cancelled',
        message: 'Your ride request has been cancelled and terminated.',
      });
      onCancelTrip();
    } catch (e) {
      hasHandledCancelRef.current = false;
      alertDialog({ title: 'Cannot Cancel', message: e?.message || 'Could not cancel trip.' });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  if (!trip) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Trip not found.</Text>
        <TouchableOpacity onPress={onCancelTrip}><Text style={{ color: COLORS.primary }}>Go Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Map Section - Identical Placement to BookRideScreen */}
      <View style={[styles.mapSection, isWideWeb && wideMapStyles.mapSection]}>
        <MapPreview
          ref={mapRef}
          region={{
            latitude: trip.pickup_lat || TOLEDO_CITY.latitude,
            longitude: trip.pickup_lng || TOLEDO_CITY.longitude,
            latitudeDelta: 0.03,
            longitudeDelta: 0.03,
          }}
          markers={markers}
          routeCoordinates={routeCoordinates}
          durationText={routeDurText || '30 MIN'}
          scrollEnabled={true}
        />

        {/* Floating Header */}
        <View style={[styles.floatingHeaderArea, isWideWeb && wideMapStyles.floatingHeaderArea]} pointerEvents="box-none">
          <TouchableOpacity style={styles.floatingBackBtn} activeOpacity={0.85} onPress={() => onNavigate('StudentDashboard')}>
            <MaterialIcons name="arrow-back" size={22} color={INK.body} />
          </TouchableOpacity>

          <View style={styles.headerTitleBadge}>
            <Text style={styles.headerTitleBadgeText}>Track Driver</Text>
          </View>

          <TouchableOpacity style={styles.floatingAvatarBtn} activeOpacity={0.85} onPress={() => onNavigate('Profile')}>
            <UserAvatar uri={userProfile?.avatar_url} name={userProfile?.full_name || 'Student'} size={38} />
          </TouchableOpacity>
        </View>

        {/* Floating Map Actions (Recenter & Fit All) */}
        <View style={styles.floatingMapActions}>
          <TouchableOpacity style={styles.mapActionBtn} activeOpacity={0.8} onPress={handleRecenter}>
            <MaterialIcons name="near-me" size={20} color={ACCENT.green} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapActionBtn} activeOpacity={0.8} onPress={handleFitBounds}>
            <MaterialIcons name="crop-free" size={20} color={INK.body} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Sheet Card Container */}
      <View style={[styles.sheetContainer, isWideWeb && wideMapStyles.sheetContainer]}>
        <View style={styles.dragHandleTouchArea}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {trip.status === 'pending' && (
            <View style={styles.statusRow}>
              <View style={styles.statusBadgePending}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.statusTextPending}>Waiting for a driver to accept...</Text>
              </View>
            </View>
          )}

          {trip.status === 'accepted' && (
            <View style={styles.statusRow}>
              <View style={styles.statusBadgeAccepted}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusTextAccepted}>
                  {driverStatusText === 'STANDBY' ? 'Driver is on standby at pickup' : 'Driver is on the way to pick you up'}
                </Text>
              </View>
            </View>
          )}

          {trip.status === 'in_progress' && (
            <View style={styles.statusRow}>
              <View style={styles.statusBadgeAccepted}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusTextAccepted}>En route to your destination</Text>
              </View>
            </View>
          )}

          {driver && (
            <View style={[styles.driverCard]}>
              <UserAvatar uri={driver.avatar_url} name={driver.full_name || 'Driver'} size={52} />
              <View style={styles.driverDetails}>
                <Text style={styles.driverName}>{driver.full_name}</Text>
                <Text style={styles.driverVehicle}>
                  {driver.vehicle_type || 'Tricycle'} • {driver.plate_number || 'N/A'}
                </Text>
              </View>
              <View style={styles.actionButtons}>
                <TouchableOpacity style={styles.circularBtn} onPress={handleCall} activeOpacity={0.75}>
                  <MaterialIcons name="call" size={20} color={COLORS.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={styles.circularBtn} onPress={() => onNavigate('Messages', { tripId: trip?.id || tripId })} activeOpacity={0.75}>
                  <MaterialIcons name="chat" size={20} color={COLORS.primary} />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Trip Info Card */}
          <View style={[styles.tripCard]}>
            <View style={styles.tripCardHeader}>
              <Text style={styles.tripCardTitle}>Trip Route</Text>
              {routeDistText && routeDurText ? (
                <View style={styles.routeDistanceBadge}>
                  <Text style={styles.routeDistanceBadgeText}>📍 {routeDistText} • ⏱️ {routeDurText}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.tripInfo}>
              <View style={styles.tripInfoItem}>
                <View style={[styles.tripIconBg, { backgroundColor: ACCENT.orangeWash }]}>
                  <MaterialIcons name="trip-origin" size={18} color={ACCENT.orange} />
                </View>
                <View style={styles.tripInfoTextWrap}>
                  <Text style={styles.tripInfoLabel}>Pickup</Text>
                  <Text style={styles.tripInfoText} numberOfLines={2}>{trip.pickup_text || 'Pickup'}</Text>
                </View>
              </View>

              <View style={styles.tripDivider} />

              <View style={styles.tripInfoItem}>
                <View style={[styles.tripIconBg, { backgroundColor: ACCENT.blueWash }]}>
                  <MaterialIcons name="location-on" size={18} color={ACCENT.blue} />
                </View>
                <View style={styles.tripInfoTextWrap}>
                  <Text style={styles.tripInfoLabel}>Destination</Text>
                  <Text style={styles.tripInfoText} numberOfLines={2}>{trip.dest_text || 'Destination'}</Text>
                </View>
              </View>
            </View>

            <View style={styles.tripMetaRow}>
              <View style={styles.tripMetaItem}>
                <MaterialIcons name="people" size={16} color={COLORS.onSurfaceVariant} />
                <Text style={styles.tripMetaText}>
                  {trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}
                </Text>
              </View>
              {trip.notes ? (
                <View style={styles.tripMetaItem}>
                  <MaterialIcons name="note" size={16} color={COLORS.onSurfaceVariant} />
                  <Text style={styles.tripMetaText} numberOfLines={1}>{trip.notes}</Text>
                </View>
              ) : null}
            </View>
          </View>

          {(trip.status === 'completed' || trip.status === 'cancelled') && (
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>
                {trip.status === 'completed' ? 'Trip completed' : 'Trip was cancelled'}
              </Text>
            </View>
          )}

          {trip.status !== 'completed' && trip.status !== 'cancelled' && (
            <TouchableOpacity
              style={[
                styles.btnCancel,
                (cancelling || cancelLocked) && styles.btnCancelDisabled,
              ]}
              activeOpacity={0.8}
              onPress={handleCancelPress}
              disabled={cancelling || cancelLocked}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <MaterialIcons
                  name={cancelLocked ? 'lock' : 'cancel'}
                  size={18}
                  color={cancelLocked ? COLORS.outline : COLORS.error}
                />
              )}
              <Text
                style={[
                  styles.btnCancelText,
                  cancelLocked && { color: COLORS.outline },
                ]}
              >
                {cancelling
                  ? 'Cancelling...'
                  : cancelLocked
                    ? 'Pick-up in progress'
                    : 'Cancel Ride'}
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      <CancelRideModal
        visible={showCancelModal}
        role="student"
        tripStatus={trip.status}
        onClose={() => setShowCancelModal(false)}
        onConfirm={handleConfirmCancel}
        loading={cancelling}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: CANVAS.raised,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
  },
  errorText: {
    fontSize: 16,
    color: COLORS.onSurfaceVariant,
  },
  mapSection: {
    flex: 0.85,
    minHeight: 250,
    position: 'relative',
    backgroundColor: CANVAS.sunken,
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
    backgroundColor: CANVAS.raised,
    justifyContent: 'center',
    alignItems: 'center',
    ...ELEVATION.lg,
  },
  headerTitleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    ...ELEVATION.sm,
  },
  headerTitleBadgeText: {
    fontSize: 15,
    fontWeight: '800',
    color: INK.strong,
    letterSpacing: -0.3,
  },
  floatingAvatarBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    ...ELEVATION.lg,
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
    backgroundColor: CANVAS.raised,
    justifyContent: 'center',
    alignItems: 'center',
    ...ELEVATION.lg,
    ...BORDERS.hair,
  },
  // Overlaps the map, so this shadow is load-bearing rather than decorative.
  sheetContainer: {
    flex: 1.15,
    backgroundColor: CANVAS.raised,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -20,
    ...ELEVATION.lg,
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
    backgroundColor: INK.faint,
  },
  sheetScroll: {
    flex: 1,
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 14,
  },
  statusRow: {
    marginBottom: 4,
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,74,198,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 10,
  },
  statusTextPending: {
    ...TYPOGRAPHY.body,
    color: COLORS.primary,
    fontWeight: '600',
  },
  statusBadgeAccepted: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,108,73,0.1)',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 10,
    alignSelf: 'flex-start',
  },
  statusTextAccepted: {
    ...TYPOGRAPHY.body,
    color: COLORS.secondary,
    fontWeight: '700',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  driverDetails: {
    flex: 1,
    marginLeft: SPACING.md,
  },
  driverName: {
    ...TYPOGRAPHY.sectionTitle,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  driverVehicle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  circularBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    ...BORDERS.strong,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CANVAS.raised,
  },
  tripCard: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  tripCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  tripCardTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  routeDistanceBadge: {
    backgroundColor: ACCENT.blueWash,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    ...BORDERS.accent,
  },
  routeDistanceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT.blueDeep,
  },
  tripInfo: {
    gap: 0,
  },
  tripInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  tripIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripInfoTextWrap: {
    flex: 1,
  },
  tripInfoLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  tripInfoText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.onSurface,
    fontWeight: '600',
    marginTop: 2,
  },
  tripDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
    marginLeft: 52,
  },
  tripMetaRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.08)',
  },
  tripMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
  },
  tripMetaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  statusText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  // A destructive outline, not a filled block. Kept as a full-weight stroke
  // because here the border carries the semantic weight of the action.
  btnCancel: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(186, 26, 26, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: CANVAS.raised,
    marginTop: 6,
  },
  btnCancelDisabled: {
    opacity: 0.6,
  },
  btnCancelText: {
    ...TYPOGRAPHY.button,
    color: COLORS.error,
  },
});
