import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Linking, ScrollView, Platform } from 'react-native';
import { alertDialog, notifyDialog } from '../../lib/dialog';
import { MaterialIcons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { TOLEDO_CITY, fetchRoute, haversineDistance, formatDistanceText, formatDurationText } from '../../config/mapConfig';
import MapPreview from '../../components/MapPreview';
import { useWideWeb, wideMapStyles } from '../../lib/webLayout';
import { getTripById, subscribeToTrip, startTrip, completeTrip, cancelTripWithReason } from '../../data/trips';
import { getProfileById } from '../../data/auth';
import { saveCancelledTrip } from '../../data/cancelledTripsStore';
import { getActiveTrip } from '../../data/activeTripStore';
import { supabase } from '../../config/supabase';
import TriRideTextLogo from '../../components/TriRideTextLogo';
import UserAvatar from '../../components/UserAvatar';
import CancelRideModal from '../../components/CancelRideModal';

export default function CurrentTripScreen({ userProfile, tripId, onTripCompleted, onCancelTrip, onNavigate }) {
  const [trip, setTrip] = useState(null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [driverCoords, setDriverCoords] = useState(null);
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistText, setRouteDistText] = useState('');
  const [routeDurText, setRouteDurText] = useState('');
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [acting, setActing] = useState(false);

  const mapRef = useRef(null);
  const isWideWeb = useWideWeb();
  const hasHandledCancelRef = useRef(false);

  useEffect(() => {
    if (!tripId) { setLoading(false); return; }

    let unsub;
    (async () => {
      try {
        const cached = await getActiveTrip(userProfile?.id);
        if (cached && cached.id === tripId) {
          setTrip(cached);
          setLoading(false);
          if (cached.student_id) {
            getProfileById(cached.student_id).then((s) => {
              if (s) setStudent(s);
            }).catch(() => {});
          }
        }
      } catch (e) {}

      try {
        const t = await getTripById(tripId);
        if (t) {
          setTrip(t);
          if (t.student_id) {
            const s = await getProfileById(t.student_id);
            if (s) setStudent(s);
          }
        }
      } catch (e) {}
      setLoading(false);
    })();

    unsub = subscribeToTrip(tripId, async (updated) => {
      setTrip(updated);
      if (updated?.status === 'cancelled' && !hasHandledCancelRef.current) {
        hasHandledCancelRef.current = true;
        setShowCancelModal(false);
        await notifyDialog({
          title: 'Ride Cancelled',
          message:
            'The student has cancelled this ride request.' +
            (updated.notes ? `\n\n${updated.notes}` : ''),
        });
        onCancelTrip();
      }
    });

    return () => { if (unsub) unsub(); };
  }, [tripId]);

  const channelRef = useRef(null);

  // Subscribe once to the real-time location channel over WebSocket
  useEffect(() => {
    if (!tripId) return;
    const channel = supabase.channel(`trip-loc-${tripId}`, {
      config: { broadcast: { self: false } },
    });
    channel.subscribe();
    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tripId]);

  // Live GPS tracking for driver with broadcast to student
  useEffect(() => {
    let locSub = null;
    let isMounted = true;

    async function startLocationWatch() {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync().catch(() => ({ status: 'denied' }));
        if (status === 'granted') {
          const initial = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
          if (initial?.coords && isMounted) {
            const coords = { latitude: initial.coords.latitude, longitude: initial.coords.longitude };
            setDriverCoords(coords);
            broadcastLocation(coords.latitude, coords.longitude);
          }

          locSub = await Location.watchPositionAsync(
            { accuracy: Location.Accuracy.High, distanceInterval: 10, timeInterval: 4000 },
            (newLoc) => {
              if (newLoc?.coords && isMounted) {
                const coords = { latitude: newLoc.coords.latitude, longitude: newLoc.coords.longitude };
                setDriverCoords(coords);
                broadcastLocation(coords.latitude, coords.longitude);
              }
            }
          ).catch(() => null);
        }
      } catch (e) {
        console.warn('Driver location tracking error:', e);
      }
    }

    startLocationWatch();
    return () => {
      isMounted = false;
      if (locSub?.remove) locSub.remove();
    };
  }, [tripId, trip?.status]);

  const broadcastLocation = (lat, lng) => {
    if (!tripId || !channelRef.current) return;
    try {
      channelRef.current.send({
        type: 'broadcast',
        event: 'driver_location',
        payload: {
          latitude: lat,
          longitude: lng,
          statusText: trip?.status === 'in_progress' ? 'DRIVING' : 'EN ROUTE',
        },
      });
    } catch (e) {}
  };

  // Fallback initial driver coords if GPS is unavailable
  useEffect(() => {
    if (!driverCoords && trip?.pickup_lat) {
      setDriverCoords({
        latitude: trip.pickup_lat + 0.003,
        longitude: trip.pickup_lng - 0.002,
      });
    }
  }, [trip?.pickup_lat, trip?.pickup_lng, driverCoords]);

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
          const mins = Math.max(1, Math.round(distKm * 3));
          setRouteDurText(formatDurationText(mins));
        }
      });
    }
    return () => { isMounted = false; };
  }, [trip?.pickup_lat, trip?.pickup_lng, trip?.dest_lat, trip?.dest_lng]);

  // Markers: Driver, Pickup, Destination
  const markers = useMemo(() => {
    const list = [];
    if (trip?.pickup_lat && trip?.pickup_lng) {
      list.push({
        id: 'pickup',
        coordinate: { latitude: trip.pickup_lat, longitude: trip.pickup_lng },
        type: 'pickup',
        label: 'Pick-up',
        color: '#f97316',
      });
    }
    if (trip?.dest_lat && trip?.dest_lng) {
      list.push({
        id: 'dest',
        coordinate: { latitude: trip.dest_lat, longitude: trip.dest_lng },
        type: 'destination',
        label: 'Drop-off',
        color: '#2563eb',
      });
    }
    if (driverCoords) {
      list.push({
        id: 'driver',
        coordinate: driverCoords,
        type: 'driver',
        label: 'You (Driver)',
        statusText: trip?.status === 'in_progress' ? 'DRIVING' : 'EN ROUTE',
        color: '#16a34a',
      });
    }
    return list;
  }, [trip, driverCoords]);

  // Auto-fit camera so whole trip indicator is seen automatically without drag/zoom
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

  const handleAction = async () => {
    // Guard against double-tap. startTrip/completeTrip filter on the current
    // status, so a second call matches 0 rows and .single() rejects — which
    // surfaced to the driver as a bogus "Could not complete trip." alert even
    // though the first tap had already succeeded.
    if (acting) return;
    setActing(true);
    try {
      if (trip.status === 'accepted') {
        await startTrip(tripId);
        alertDialog({ title: 'Trip Started', message: 'Passenger picked up. Heading to destination.' });
      } else if (trip.status === 'in_progress') {
        await completeTrip(tripId);
        onTripCompleted();
      }
    } catch (e) {
      alertDialog({
        title: 'Error',
        message:
          trip.status === 'accepted'
            ? 'Could not start trip.'
            : 'Could not complete trip.',
      });
    } finally {
      setActing(false);
    }
  };

  const handleCancelPress = () => {
    if (trip?.status === 'in_progress') {
      alertDialog({
        title: 'Ride in Progress',
        message:
          'You have already started this ride. Rides cannot be cancelled while in progress. Please complete the trip or reach the drop-off safely.',
      });
      return;
    }
    setShowCancelModal(true);
  };

  const handleConfirmCancel = async (reason) => {
    setCancelling(true);
    try {
      hasHandledCancelRef.current = true;
      await cancelTripWithReason({
        tripId,
        role: 'driver',
        reason,
      });
      if (trip) saveCancelledTrip(trip);
      setShowCancelModal(false);
      await notifyDialog({
        title: 'Ride Cancelled',
        message: 'You have cancelled this ride request and it has been terminated.',
      });
      onCancelTrip();
    } catch (e) {
      hasHandledCancelRef.current = false;
      alertDialog({ title: 'Cannot Cancel', message: e?.message || 'Could not cancel trip.' });
    } finally {
      setCancelling(false);
    }
  };

  const handleCall = () => {
    if (student?.phone) {
      Linking.openURL(`tel:${student.phone}`).catch(() => {
        alertDialog({ title: 'Cannot Call', message: 'Unable to open phone dialer.' });
      });
    } else {
      alertDialog({ title: 'No Phone Number', message: 'The passenger has not provided a phone number.' });
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
        <TouchableOpacity onPress={() => onNavigate('Home')}><Text style={{ color: COLORS.primary }}>Go Back</Text></TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Top Map Section */}
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
          <TouchableOpacity style={styles.floatingBackBtn} activeOpacity={0.85} onPress={() => onNavigate('Home')}>
            <MaterialIcons name="arrow-back" size={22} color="#1e293b" />
          </TouchableOpacity>

          <View style={styles.headerBadge}>
            <Text style={styles.headerBadgeText}>
              {trip.status === 'accepted' ? 'EN ROUTE TO PICKUP' : trip.status === 'in_progress' ? 'DRIVING TO DROP-OFF' : 'TRIP ACTIVE'}
            </Text>
          </View>

          <TouchableOpacity style={styles.floatingAvatarBtn} activeOpacity={0.85} onPress={() => onNavigate('Profile')}>
            <UserAvatar uri={userProfile?.avatar_url} name={userProfile?.full_name || 'Driver'} size={38} />
          </TouchableOpacity>
        </View>

        {/* Floating Map Actions (Recenter & Fit All) */}
        <View style={styles.floatingMapActions}>
          <TouchableOpacity style={styles.mapActionBtn} activeOpacity={0.8} onPress={handleRecenter}>
            <MaterialIcons name="near-me" size={20} color="#16a34a" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mapActionBtn} activeOpacity={0.8} onPress={handleFitBounds}>
            <MaterialIcons name="crop-free" size={20} color="#1e293b" />
          </TouchableOpacity>
        </View>
      </View>

      {/* Bottom Sheet Card */}
      <View style={[styles.sheetContainer, isWideWeb && wideMapStyles.sheetContainer]}>
        <View style={styles.dragHandleTouchArea}>
          <View style={styles.dragHandle} />
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Passenger Details */}
          <View style={styles.passengerRow}>
            <UserAvatar uri={student?.avatar_url} name={student?.full_name || 'Passenger'} size={50} />
            <View style={styles.passengerDetails}>
              <Text style={styles.passengerName}>{student?.full_name || 'Passenger Rider'}</Text>
              <Text style={styles.passengerSub}>
                {trip.passengers} passenger{trip.passengers > 1 ? 's' : ''} • Student
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

          {trip.notes ? (
            <View style={styles.notesCard}>
              <MaterialIcons name="note" size={18} color={COLORS.onSurfaceVariant} />
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          ) : null}

          {/* Trip Locations with connected visual indicator */}
          <View style={[styles.tripLocationsCard, SHADOWS.diffusion]}>
            <View style={styles.locationsHeader}>
              <Text style={styles.locationsTitle}>Trip Itinerary</Text>
              {routeDistText && routeDurText ? (
                <View style={styles.routeDistanceBadge}>
                  <Text style={styles.routeDistanceBadgeText}>📍 {routeDistText} • ⏱️ {routeDurText}</Text>
                </View>
              ) : null}
            </View>

            <View style={styles.locationItem}>
              <View style={[styles.locationIconBg, { backgroundColor: '#fff7ed' }]}>
                <MaterialIcons name="trip-origin" size={18} color="#f97316" />
              </View>
              <View style={styles.locationTextWrap}>
                <Text style={styles.locationLabel}>Pickup Point</Text>
                <Text style={styles.locationAddress} numberOfLines={2}>{trip.pickup_text || 'Pickup Location'}</Text>
              </View>
            </View>

            <View style={styles.tripDivider} />

            <View style={styles.locationItem}>
              <View style={[styles.locationIconBg, { backgroundColor: '#eff6ff' }]}>
                <MaterialIcons name="location-on" size={18} color="#2563eb" />
              </View>
              <View style={styles.locationTextWrap}>
                <Text style={styles.locationLabel}>Destination Drop-off</Text>
                <Text style={styles.locationAddress} numberOfLines={2}>{trip.dest_text || 'Destination Location'}</Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsRow}>
            <TouchableOpacity
              style={[styles.btnCancel, cancelling && { opacity: 0.6 }]}
              activeOpacity={0.8}
              onPress={handleCancelPress}
              disabled={cancelling}
            >
              <MaterialIcons name="cancel" size={18} color={COLORS.error} />
              <Text style={styles.btnCancelText}>{cancelling ? 'Cancelling...' : 'Cancel'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnAction, trip.status === 'in_progress' ? styles.btnActionComplete : styles.btnActionStart]}
              activeOpacity={0.9}
              onPress={handleAction}
              disabled={acting}
            >
              <MaterialIcons
                name={trip.status === 'in_progress' ? 'check' : 'play-arrow'}
                size={22}
                color="#ffffff"
              />
              <Text style={styles.btnActionText}>
                {acting
                  ? 'Please wait...'
                  : trip.status === 'in_progress' ? 'Complete Trip' : 'Start Trip'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>

      <CancelRideModal
        visible={showCancelModal}
        role="driver"
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
    backgroundColor: '#ffffff',
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
    paddingHorizontal: 16,
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
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.secondary,
    letterSpacing: 0.4,
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
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 40,
    gap: 14,
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  passengerDetails: {
    marginLeft: SPACING.md,
    flex: 1,
  },
  passengerName: {
    ...TYPOGRAPHY.sectionTitle,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  passengerSub: {
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
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  notesCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  notesText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    flex: 1,
    fontWeight: '500',
  },
  tripLocationsCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  locationsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  locationsTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  routeDistanceBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  routeDistanceBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  locationItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  locationIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  locationTextWrap: {
    flex: 1,
  },
  locationLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  locationAddress: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.onSurface,
    fontWeight: '600',
    marginTop: 2,
  },
  tripDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginLeft: 52,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: 6,
  },
  btnCancel: {
    flex: 0.8,
    flexDirection: 'row',
    height: 52,
    borderWidth: 1,
    borderColor: COLORS.error,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  btnCancelText: {
    ...TYPOGRAPHY.button,
    color: COLORS.error,
  },
  btnAction: {
    flex: 1.2,
    flexDirection: 'row',
    height: 52,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  btnActionStart: {
    backgroundColor: COLORS.primary,
  },
  btnActionComplete: {
    backgroundColor: COLORS.secondary,
  },
  btnActionText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
    fontSize: 15,
  },
});
