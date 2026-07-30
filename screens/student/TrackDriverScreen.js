import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { TOLEDO_CITY } from '../../config/mapConfig';
import { getTripById, subscribeToTrip, cancelTripByStudent } from '../../data/trips';
import { getProfileById } from '../../data/auth';
import MapPreview from '../../components/MapPreview';

export default function TrackDriverScreen({ userProfile, tripId, onCancelTrip, onNavigate }) {
  const [trip, setTrip] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!tripId) { setLoading(false); return; }

    let unsub;
    (async () => {
      try {
        const t = await getTripById(tripId);
        setTrip(t);
        if (t.driver_id) {
          const d = await getProfileById(t.driver_id);
          setDriver(d);
        }
      } catch (e) {}
      setLoading(false);
    })();

    unsub = subscribeToTrip(tripId, async (updated) => {
      setTrip(updated);
      if (updated.driver_id && !driver) {
        const d = await getProfileById(updated.driver_id);
        setDriver(d);
      }
    });

    return () => { if (unsub) unsub(); };
  }, [tripId]);

  const handleCancel = async () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel?', [
      { text: 'No', style: 'cancel' },
      {
        text: 'Yes',
        style: 'destructive',
        onPress: async () => {
          if (cancelling) return;
          setCancelling(true);
          try {
            const result = await cancelTripByStudent(tripId);
            if (result) {
              onCancelTrip();
            } else {
              Alert.alert('Error', 'Could not cancel trip. It may have already been accepted by a driver.');
            }
          } catch (e) {
            console.error('Cancel trip error:', e);
            Alert.alert('Error', 'Could not cancel trip. Please try again.');
          } finally {
            setCancelling(false);
          }
        },
      },
    ]);
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

  const mapRegion = {
    latitude: trip.pickup_lat,
    longitude: trip.pickup_lng,
    latitudeDelta: 0.03,
    longitudeDelta: 0.03,
  };

  const markers = [
    { id: 'pickup', coordinate: { latitude: trip.pickup_lat, longitude: trip.pickup_lng }, color: COLORS.primary },
    ...(trip.dest_lat && trip.dest_lng
      ? [{ id: 'dest', coordinate: { latitude: trip.dest_lat, longitude: trip.dest_lng }, color: '#006c49' }]
      : []),
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={handleCancel}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Track Driver</Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => onNavigate('Profile')}>
          <Image
            source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuCRRTrXBP66RIGGWe_yjfYPXqqmjb9_2Z1b-3pBsp4gsGY9tFcmJWUgiPQZCv9-zL7Ow6lR9VabxSGFdPYgRAdoTwSwnK4SdFTlsvDuzfa1zx-44GNvhM8af1rTOBq8vEMVglBzqPdyVmuD0K8TDdCnpeAKxrpyNviSDfN-uHyowq1ISNm4_y2AL2IhFz8gE4-yZGwzh2o1EpjelkekThDPWiAlyFh4ifateDo3m_b6_0bWK-c3PjUOgc2Msb110cg1g_aZFCV9ppg' }}
            style={styles.avatar}
          />
        </TouchableOpacity>
      </View>

      <View style={styles.mapWrapper}>
        <MapPreview region={mapRegion} markers={markers} />
      </View>

      <View style={[styles.bottomSheet, SHADOWS.diffusion]}>
        <View style={styles.dragHandle} />
        <View style={styles.bottomSheetContent}>
          {trip.status === 'pending' && (
            <View style={styles.statusRow}>
              <View style={styles.statusBadgePending}>
                <ActivityIndicator size="small" color={COLORS.primary} />
                <Text style={styles.statusTextPending}>Waiting for a driver to accept...</Text>
              </View>
            </View>
          )}

          {trip.status === 'accepted' && driver && (
            <>
              <View style={styles.statusRow}>
                <View style={styles.statusBadgeAccepted}>
                  <View style={styles.pulseDot} />
                  <Text style={styles.statusTextAccepted}>Driver accepted your ride</Text>
                </View>
              </View>
              <View style={styles.driverCard}>
                <View style={styles.driverAvatarBg}>
                  <MaterialIcons name="person" size={32} color={COLORS.primary} />
                </View>
                <View style={styles.driverDetails}>
                  <Text style={styles.driverName}>{driver.full_name}</Text>
                  <Text style={styles.driverVehicle}>
                    {driver.vehicle_type || 'Tricycle'} • {driver.plate_number || 'N/A'}
                  </Text>
                </View>
                <View style={styles.actionButtons}>
                  <TouchableOpacity style={styles.circularBtn}>
                    <MaterialIcons name="call" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.circularBtn} onPress={() => onNavigate('Messages')}>
                    <MaterialIcons name="chat" size={20} color={COLORS.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              <View style={styles.tripInfo}>
                <View style={styles.tripInfoItem}>
                  <MaterialIcons name="trip-origin" size={16} color={COLORS.primary} />
                  <Text style={styles.tripInfoText} numberOfLines={1}>{trip.pickup_text || 'Pickup'}</Text>
                </View>
                <View style={styles.tripInfoItem}>
                  <MaterialIcons name="location-on" size={16} color={COLORS.secondary} />
                  <Text style={styles.tripInfoText} numberOfLines={1}>{trip.dest_text || 'Destination'}</Text>
                </View>
                <Text style={styles.passengerText}>{trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}</Text>
              </View>
            </>
          )}

          {(trip.status === 'completed' || trip.status === 'cancelled') && (
            <View style={styles.statusRow}>
              <Text style={styles.statusText}>
                {trip.status === 'completed' ? 'Trip completed' : 'Trip was cancelled'}
              </Text>
            </View>
          )}

          {trip.status !== 'completed' && trip.status !== 'cancelled' && (
            <TouchableOpacity
              style={[styles.btnCancel, cancelling && styles.btnCancelDisabled]}
              activeOpacity={0.8}
              onPress={handleCancel}
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
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  errorText: { fontSize: 16, color: COLORS.onSurfaceVariant },
  header: {
    flexDirection: 'row', height: 60, paddingTop: 8, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerIconBtn: { padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.primary, fontWeight: '800' },
  avatarBtn: { width: 40, height: 40, borderRadius: 20, overflow: 'hidden' },
  avatar: { width: '100%', height: '100%' },
  mapWrapper: { flex: 1, marginTop: 68 },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  dragHandle: {
    width: 40, height: 5, borderRadius: 2.5, backgroundColor: COLORS.outlineVariant,
    alignSelf: 'center', marginTop: 12,
  },
  bottomSheetContent: {
    paddingHorizontal: SPACING.marginMobile, paddingTop: SPACING.sm,
    maxWidth: 600, alignSelf: 'center', width: '100%',
  },
  statusRow: { marginBottom: SPACING.md },
  statusBadgePending: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,74,198,0.1)',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 10,
  },
  statusTextPending: { ...TYPOGRAPHY.body, color: COLORS.primary, fontWeight: '600' },
  statusBadgeAccepted: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: 'rgba(0,108,73,0.1)',
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 20, gap: 10,
  },
  statusTextAccepted: { ...TYPOGRAPHY.body, color: COLORS.secondary, fontWeight: '600' },
  pulseDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.secondary },
  driverCard: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff',
    borderWidth: 1, borderColor: COLORS.outlineVariant, borderRadius: ROUNDED.md,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  driverAvatarBg: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center',
  },
  driverDetails: { flex: 1, marginLeft: SPACING.md },
  driverName: { ...TYPOGRAPHY.sectionTitle, fontWeight: '700', color: COLORS.onSurface },
  driverVehicle: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },
  actionButtons: { flexDirection: 'row', gap: SPACING.sm },
  circularBtn: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant,
    justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surfaceContainerLowest,
  },
  tripInfo: { gap: SPACING.sm, marginBottom: SPACING.md },
  tripInfoItem: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  tripInfoText: { ...TYPOGRAPHY.body, fontSize: 14, color: COLORS.onSurface, flex: 1 },
  passengerText: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, marginLeft: 28 },
  statusText: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant, textAlign: 'center' },
  btnCancel: {
    flexDirection: 'row', height: 50, borderRadius: 12, borderWidth: 1, borderColor: COLORS.error,
    justifyContent: 'center', alignItems: 'center', gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainerLowest, marginTop: SPACING.sm,
  },
  btnCancelDisabled: {
    opacity: 0.6,
  },
  btnCancelText: { ...TYPOGRAPHY.button, color: COLORS.error },
});
