import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { haversineDistance } from '../../config/mapConfig';
import MapPreview from '../../components/MapPreview';
import { getTripById, subscribeToTrip, startTrip, completeTrip, calculateFare } from '../../data/trips';
import { getProfileById } from '../../data/auth';

export default function CurrentTripScreen({ userProfile, tripId, onTripCompleted, onCancelTrip, onNavigate }) {
  const [trip, setTrip] = useState(null);
  const [student, setStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tripId) { setLoading(false); return; }

    let unsub;
    (async () => {
      try {
        const t = await getTripById(tripId);
        setTrip(t);
        const s = await getProfileById(t.student_id);
        setStudent(s);
      } catch (e) {}
      setLoading(false);
    })();

    unsub = subscribeToTrip(tripId, async (updated) => {
      setTrip(updated);
    });

    return () => { if (unsub) unsub(); };
  }, [tripId]);

  const handleAction = async () => {
    if (trip.status === 'accepted') {
      try {
        await startTrip(tripId);
        Alert.alert('Trip Started', 'Passenger has been picked up.');
      } catch (e) {
        Alert.alert('Error', 'Could not start trip.');
      }
    } else if (trip.status === 'in_progress') {
      const dist = haversineDistance(trip.pickup_lat, trip.pickup_lng, trip.dest_lat, trip.dest_lng);
      const fare = calculateFare(dist);
      Alert.alert('Complete Trip', `Fare: ₱${fare.toFixed(2)} (${dist.toFixed(1)} km)`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            try {
              await completeTrip(tripId, fare);
              onTripCompleted();
            } catch (e) {
              Alert.alert('Error', 'Could not complete trip.');
            }
          },
        },
      ]);
    }
  };

  const handleCall = () => {
    Alert.alert('Calling', `Calling ${student?.full_name || 'passenger'}...`);
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

  const dist = haversineDistance(trip.pickup_lat, trip.pickup_lng, trip.dest_lat, trip.dest_lng);
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
          <TouchableOpacity style={styles.headerIconBtn} onPress={onCancelTrip}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TriRide</Text>
        </View>
        <View style={styles.headerRight}>
          <View style={styles.badgeDriving}>
            <Text style={styles.badgeDrivingText}>
              {trip.status === 'accepted' ? 'EN ROUTE' : trip.status === 'in_progress' ? 'DRIVING' : 'WAITING'}
            </Text>
          </View>
          <View style={styles.avatarBtn}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAeedCvOJi6L1fRIA6hkkY8JjPF6jVz3sVJBKc9-ZCgUKH6wzzn05HcyMRmRF7gzL39Q56jNdxoSj7_PWs6fYmD2szAEdcs8yHptbQOmMLzEXQs41jdfm4yM3CVpb7ACfE1Gkza7WjpsTThCrQ87GQM0PkcaPIXYJ98su-X3B79tkleYPJDuBlDj2uBA12CrDljqqFqld9r4X1cngNRTmn7RsbuKuenpo6T-kuZXl4ZOrbL6OXIUBI18DF6INPV8rxNQcbp4cWqv3s' }}
              style={styles.avatar}
            />
          </View>
        </View>
      </View>

      <View style={styles.mapWrapper}>
        <MapPreview region={mapRegion} markers={markers} />
      </View>

      <View style={[styles.bottomSheet, SHADOWS.diffusion]}>
        <View style={styles.dragHandle} />
        <View style={styles.bottomSheetContent}>
          <View style={styles.passengerRow}>
            <View style={styles.photoContainer}>
              <View style={styles.passengerAvatarBg}>
                <MaterialIcons name="person" size={32} color={COLORS.primary} />
              </View>
            </View>
            <View style={styles.passengerDetails}>
              <Text style={styles.passengerName}>{student?.full_name || 'Passenger'}</Text>
              <Text style={styles.passengerSub}>{trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}</Text>
            </View>
            <View style={styles.actionButtons}>
              <TouchableOpacity style={styles.circularBtn} onPress={handleCall}>
                <MaterialIcons name="call" size={20} color={COLORS.primary} />
              </TouchableOpacity>
              <TouchableOpacity style={styles.circularBtn} onPress={() => onNavigate('Messages')}>
                <MaterialIcons name="chat" size={20} color={COLORS.primary} />
              </TouchableOpacity>
            </View>
          </View>

          {trip.notes && (
            <View style={styles.notesCard}>
              <MaterialIcons name="note" size={18} color={COLORS.onSurfaceVariant} />
              <Text style={styles.notesText}>{trip.notes}</Text>
            </View>
          )}

          <View style={styles.tripLocations}>
            <View style={styles.locationItem}>
              <View style={styles.connectingDots}>
                <View style={styles.dotPrimary} />
                <View style={styles.line} />
                <View style={styles.dotSecondary} />
              </View>
              <View style={styles.locationsDetailsWrapper}>
                <View style={styles.locationDetailBlock}>
                  <Text style={styles.locationLabel}>Pickup</Text>
                  <Text style={styles.locationAddress}>{trip.pickup_text || 'Location'}</Text>
                </View>
                <View style={[styles.locationDetailBlock, { marginTop: 12 }]}>
                  <Text style={styles.locationLabel}>Drop-off</Text>
                  <Text style={styles.locationAddress}>{trip.dest_text || 'Location'}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.distanceRow}>
            <MaterialIcons name="straighten" size={16} color={COLORS.onSurfaceVariant} />
            <Text style={styles.distanceText}>{dist.toFixed(1)} km • ~{Math.round(dist * 3)} min</Text>
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.btnCancel} activeOpacity={0.8} onPress={onCancelTrip}>
              <MaterialIcons name="cancel" size={18} color={COLORS.error} />
              <Text style={styles.btnCancelText}>Cancel Trip</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnAction, trip.status === 'in_progress' ? styles.btnActionComplete : styles.btnActionStart]}
              activeOpacity={0.9}
              onPress={handleAction}
            >
              <MaterialIcons
                name={trip.status === 'in_progress' ? 'check' : 'play-arrow'}
                size={22}
                color="#ffffff"
              />
              <Text style={styles.btnActionText}>
                {trip.status === 'in_progress' ? 'Complete Trip' : 'Start Trip'}
              </Text>
            </TouchableOpacity>
          </View>
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
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  badgeDriving: { backgroundColor: COLORS.secondaryContainer, paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  badgeDrivingText: { ...TYPOGRAPHY.caption, fontWeight: '800', color: COLORS.onSecondaryContainer },
  avatarBtn: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: COLORS.primaryContainer },
  avatar: { width: '100%', height: '100%' },
  mapWrapper: { flex: 1, marginTop: 68 },
  bottomSheet: {
    position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: '#ffffff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40,
    borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  dragHandle: { width: 40, height: 5, borderRadius: 2.5, backgroundColor: COLORS.outlineVariant, alignSelf: 'center', marginTop: 12 },
  bottomSheetContent: {
    paddingHorizontal: SPACING.marginMobile, paddingTop: SPACING.sm,
    maxWidth: 600, alignSelf: 'center', width: '100%',
  },
  passengerRow: { flexDirection: 'row', alignItems: 'center', marginBottom: SPACING.lg },
  photoContainer: { position: 'relative' },
  passengerAvatarBg: {
    width: 64, height: 64, borderRadius: 16, backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: COLORS.outlineVariant,
  },
  passengerDetails: { marginLeft: SPACING.md, flex: 1 },
  passengerName: { ...TYPOGRAPHY.sectionTitle, fontWeight: '700', color: COLORS.onSurface },
  passengerSub: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, marginTop: 2 },
  actionButtons: { flexDirection: 'row', gap: SPACING.sm },
  circularBtn: {
    width: 44, height: 44, borderRadius: 12, borderWidth: 1, borderColor: COLORS.outlineVariant,
    justifyContent: 'center', alignItems: 'center', backgroundColor: COLORS.surfaceContainerLowest,
  },
  notesCard: {
    flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainerLow, borderRadius: ROUNDED.md,
    padding: SPACING.md, marginBottom: SPACING.md,
  },
  notesText: { ...TYPOGRAPHY.body, fontSize: 14, color: COLORS.onSurfaceVariant, flex: 1, fontWeight: '500' },
  tripLocations: { marginBottom: SPACING.md },
  locationItem: { flexDirection: 'row', gap: SPACING.sm },
  connectingDots: { alignItems: 'center', width: 12, paddingVertical: 6 },
  dotPrimary: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary },
  line: { width: 1, flex: 1, backgroundColor: COLORS.outlineVariant, marginVertical: 4 },
  dotSecondary: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.error },
  locationsDetailsWrapper: { flex: 1 },
  locationDetailBlock: { gap: 2 },
  locationLabel: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: COLORS.outline, letterSpacing: 0.5 },
  locationAddress: { ...TYPOGRAPHY.body, fontSize: 14, fontWeight: '600', color: COLORS.onSurface },
  distanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: SPACING.md,
    paddingVertical: SPACING.sm, paddingHorizontal: SPACING.md,
    backgroundColor: COLORS.surfaceContainerLow, borderRadius: ROUNDED.md,
  },
  distanceText: { ...TYPOGRAPHY.body, fontSize: 14, color: COLORS.onSurfaceVariant, fontWeight: '500' },
  actionsRow: { flexDirection: 'row', gap: SPACING.md, marginTop: SPACING.sm },
  btnCancel: {
    flex: 1, flexDirection: 'row', height: 50, borderWidth: 1, borderColor: COLORS.error,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 6,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  btnCancelText: { ...TYPOGRAPHY.button, color: COLORS.error },
  btnAction: { flex: 1, flexDirection: 'row', height: 50, borderRadius: 12, justifyContent: 'center', alignItems: 'center', gap: 6 },
  btnActionStart: { backgroundColor: COLORS.primary },
  btnActionComplete: { backgroundColor: COLORS.secondary },
  btnActionText: { ...TYPOGRAPHY.button, color: '#ffffff' },
});
