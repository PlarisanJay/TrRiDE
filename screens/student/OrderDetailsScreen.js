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
import { getTripById, cancelTripWithReason, subscribeToTrip } from '../../data/trips';
import { getProfileById } from '../../data/auth';
import { createRating, hasRatedTrip } from '../../data/ratings';
import { TOLEDO_CITY, fetchRoute, haversineDistance, formatDistanceText, formatDurationText } from '../../config/mapConfig';
import { supabase } from '../../config/supabase';
import MapPreview from '../../components/MapPreview';
import UserAvatar from '../../components/UserAvatar';
import CancelRideModal from '../../components/CancelRideModal';
import { useWideWeb, wideMapStyles } from '../../lib/webLayout';

export default function OrderDetailsScreen({ userProfile, tripId, onGoBack, onNavigate }) {
  const [trip, setTrip] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);
  const [submittedRating, setSubmittedRating] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  // Live driver & route states
  const [driverCoords, setDriverCoords] = useState(null);
  const [driverStatusText, setDriverStatusText] = useState('ON THE WAY');
  const [routeCoordinates, setRouteCoordinates] = useState([]);
  const [routeDistance, setRouteDistance] = useState('');
  const [routeDuration, setRouteDuration] = useState('30 MIN');
  const [showCancelModal, setShowCancelModal] = useState(false);

  const mapRef = useRef(null);
  const isWideWeb = useWideWeb();
  const hasHandledCancelRef = useRef(false);

  // Load trip and driver data
  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      return;
    }

    let unsub;
    let pollTimer;

    (async () => {
      try {
        const t = await getTripById(tripId);
        setTrip(t);
        if (t && t.driver_id) {
          try {
            const d = await getProfileById(t.driver_id);
            setDriver(d);
          } catch (e) {
            console.warn('Could not load driver profile:', e.message);
          }
          if (t.status === 'completed') {
            try {
              const rated = await hasRatedTrip(tripId, userProfile?.id);
              if (rated) setSubmittedRating(rated.rating);
            } catch (e) {
              console.warn('Could not load existing rating:', e.message);
            }
          }
        }
      } catch (e) {
        console.error('Failed to load trip:', e);
      }
      setLoading(false);
    })();

    unsub = subscribeToTrip(tripId, async (updated) => {
      setTrip(updated);
      if (updated.driver_id && !driver) {
        try {
          const d = await getProfileById(updated.driver_id);
          setDriver(d);
        } catch (e) {}
      }
      if (updated.status === 'completed') {
        try {
          const rated = await hasRatedTrip(tripId, userProfile?.id);
          if (rated) setSubmittedRating(rated.rating);
        } catch (e) {
          console.warn('Could not load existing rating:', e.message);
        }
      }
      if (updated.status === 'cancelled' && !hasHandledCancelRef.current) {
        hasHandledCancelRef.current = true;
        setShowCancelModal(false);
        // Navigate away immediately — dialog persists in the global queue
        // and will render on the home screen without blocking navigation.
        onGoBack();
        notifyDialog({
          title: 'Ride Cancelled',
          message:
            'This ride has been cancelled and terminated.' +
            (updated.notes ? `\n\n${updated.notes}` : ''),
        });
      }
    });

    // Poll fallback so the trip status updates reliably
    pollTimer = setInterval(async () => {
      if (!tripId) { clearInterval(pollTimer); return; }
      try {
        const t = await getTripById(tripId);
        setTrip(t);
        if (t.status === 'completed' || t.status === 'cancelled') {
          clearInterval(pollTimer);
          if (t.status === 'completed') {
            try {
              const rated = await hasRatedTrip(tripId, userProfile?.id);
              if (rated) setSubmittedRating(rated.rating);
            } catch (e) {
              console.warn('Could not load existing rating:', e.message);
            }
          }
        }
      } catch (e) {}
    }, 4000);

    return () => {
      if (unsub) unsub();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [tripId]);

  // Real-time broadcast listener for live driver location
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

  // Initial / fallback driver coordinates based on trip state
  useEffect(() => {
    if (!trip?.pickup_lat || !trip?.pickup_lng) return;

    if (!driverCoords && trip.driver_id) {
      if (trip.status === 'accepted') {
        // Driver approaching pickup (~400m approach offset)
        setDriverCoords({
          latitude: trip.pickup_lat + 0.0032,
          longitude: trip.pickup_lng - 0.0025,
        });
        setDriverStatusText('ON THE WAY');
      } else if (trip.status === 'in_progress') {
        // Driver moving between pickup and destination
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
          setRouteDuration(res.durationText || '30 MIN');
          setRouteDistance(res.distanceText || '');
        }
      }).catch(() => {
        if (isMounted) {
          const distKm = haversineDistance(trip.pickup_lat, trip.pickup_lng, trip.dest_lat, trip.dest_lng);
          setRouteDistance(formatDistanceText(Math.round(distKm * 1000)));
          const mins = Math.max(1, Math.round(distKm * 3));
          setRouteDuration(formatDurationText(mins));
        }
      });
    }
    return () => { isMounted = false; };
  }, [trip?.pickup_lat, trip?.pickup_lng, trip?.dest_lat, trip?.dest_lng]);

  // Markers: Driver (on the way / standby), Pickup, Destination
  const mapMarkers = useMemo(() => {
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

  // Auto-fit bounds on initial load & marker changes (automatically see whole indicator)
  useEffect(() => {
    if (mapMarkers.length > 0) {
      const timer = setTimeout(() => {
        mapRef.current?.fitBounds();
      }, 350);
      return () => clearTimeout(timer);
    }
  }, [mapMarkers.length, routeCoordinates.length]);

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

  const handleCall = () => {
    if (driver?.phone) {
      Linking.openURL(`tel:${driver.phone}`).catch(() => {
        alertDialog({ title: 'Cannot Call', message: 'Unable to open phone dialer.' });
      });
    } else {
      alertDialog({ title: 'No Phone Number', message: 'The driver has not provided a phone number.' });
    }
  };

  const handleSubmitRating = async (stars) => {
    if (!trip?.driver_id || submitting || submittedRating) return;
    setSubmitting(true);
    try {
      await createRating({
        tripId: trip.id,
        driverId: trip.driver_id,
        studentId: userProfile.id,
        rating: stars,
      });
      setSubmittedRating(stars);
    } catch (e) {
      console.warn('Could not submit rating:', e.message);
      alertDialog({ title: 'Error', message: 'Could not submit rating. Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelPress = () => {
    if (trip?.status === 'in_progress') {
      alertDialog({
        title: 'Ride in Progress',
        message:
          'This ride is currently active and in progress. Rides cannot be cancelled while on the road. Please reach your destination safely.',
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
        role: 'student',
        reason,
      });
      setShowCancelModal(false);
      // Navigate immediately — dialog renders on the home screen.
      onGoBack();
      notifyDialog({
        title: 'Ride Cancelled',
        message: 'Your ride request has been cancelled and terminated.',
      });
    } catch (e) {
      hasHandledCancelRef.current = false;
      alertDialog({ title: 'Cannot Cancel', message: e?.message || 'Could not cancel trip. It may already be in progress.' });
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
        <TouchableOpacity onPress={onGoBack}>
          <Text style={{ color: COLORS.primary }}>Go Back</Text>
        </TouchableOpacity>
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
          markers={mapMarkers}
          routeCoordinates={routeCoordinates}
          durationText={routeDuration}
          scrollEnabled={true}
        />

        {/* Floating Header */}
        <View style={[styles.floatingHeaderArea, isWideWeb && wideMapStyles.floatingHeaderArea]} pointerEvents="box-none">
          <TouchableOpacity style={styles.floatingBackBtn} activeOpacity={0.85} onPress={onGoBack}>
            <MaterialIcons name="arrow-back" size={22} color={INK.body} />
          </TouchableOpacity>

          <View style={styles.headerTitleBadge}>
            <Text style={styles.headerTitleBadgeText}>Order Details</Text>
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
          {/* Status Badge */}
          <View style={styles.statusRow}>
            {trip.status === 'completed' ? (
              <View style={[styles.statusBadgeAccepted, styles.statusBadgeCompleted]}>
                <MaterialIcons name="check-circle" size={16} color={ACCENT.green} />
                <Text style={[styles.statusTextAccepted, { color: ACCENT.green }]}>Ride completed</Text>
              </View>
            ) : trip.status === 'cancelled' ? (
              <View style={[styles.statusBadgeAccepted, styles.statusBadgeCancelled]}>
                <MaterialIcons name="cancel" size={16} color={COLORS.outline} />
                <Text style={[styles.statusTextAccepted, { color: COLORS.outline }]}>Ride was cancelled</Text>
              </View>
            ) : (
              <View style={styles.statusBadgeAccepted}>
                <View style={styles.pulseDot} />
                <Text style={styles.statusTextAccepted}>
                  {trip.status === 'in_progress'
                    ? 'Driver is on the way to your destination'
                    : driverStatusText === 'STANDBY'
                    ? 'Driver is on standby at pickup'
                    : 'Driver accepted your ride'}
                </Text>
              </View>
            )}
          </View>

          {/* Driver Card */}
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
              <Text style={styles.tripCardTitle}>Trip Information</Text>
              {routeDistance && routeDuration ? (
                <View style={styles.routeDistanceBadge}>
                  <Text style={styles.routeDistanceBadgeText}>📍 {routeDistance} • ⏱️ {routeDuration}</Text>
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

          {/* Safety Card */}
          <View style={[styles.safetyCard]}>
            <MaterialIcons name="shield" size={24} color={COLORS.secondary} />
            <View style={styles.safetyTextWrap}>
              <Text style={styles.safetyTitle}>Safety Tips</Text>
              <Text style={styles.safetyText}>
                Share your trip status with a friend. Always verify the driver and plate number before boarding.
              </Text>
            </View>
          </View>

          {/* Rating Card */}
          {trip.status === 'completed' && (
            <View style={[styles.ratingCard]}>
              <MaterialIcons name="star" size={24} color={ACCENT.amber} />
              <View style={styles.ratingTextWrap}>
                <Text style={styles.ratingTitle}>
                  {submittedRating ? `You rated ${submittedRating} ${submittedRating > 1 ? 'stars' : 'star'}` : 'Rate your driver'}
                </Text>
                <Text style={styles.ratingText}>
                  {submittedRating ? 'Thanks for your feedback!' : 'How was your ride? Tap a star to rate your driver.'}
                </Text>
              </View>
              {!submittedRating && (
                <View style={styles.starRow}>
                  {[1, 2, 3, 4, 5].map((star) => (
                    <TouchableOpacity key={star} disabled={submitting} onPress={() => handleSubmitRating(star)}>
                      <MaterialIcons name={submitting ? 'star-border' : 'star'} size={32} color={submitting ? COLORS.outlineVariant : ACCENT.amber} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* Cancel Ride Action */}
          {trip.status !== 'completed' && trip.status !== 'cancelled' && (
            <TouchableOpacity
              style={[styles.btnCancel, cancelling && styles.btnCancelDisabled]}
              activeOpacity={0.8}
              onPress={handleCancelPress}
              disabled={cancelling}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={COLORS.error} />
              ) : (
                <MaterialIcons name="cancel" size={18} color={COLORS.error} />
              )}
              <Text style={styles.btnCancelText}>{cancelling ? 'Cancelling...' : 'Cancel Ride'}</Text>
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
  // Floating map controls need real lift to separate from map imagery.
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
  statusBadgeCompleted: {
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
  },
  statusBadgeCancelled: {
    backgroundColor: 'rgba(115, 118, 134, 0.12)',
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
  safetyCard: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,108,73,0.05)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(0,108,73,0.2)',
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  safetyTextWrap: {
    flex: 1,
  },
  safetyTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.secondary,
  },
  safetyText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 4,
  },
  ratingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: CANVAS.raised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245, 158, 11, 0.28)',
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    gap: SPACING.md,
  },
  ratingTextWrap: {
    flex: 1,
  },
  ratingTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  ratingText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  starRow: {
    flexDirection: 'row',
    gap: 4,
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
