import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getTripById, cancelTripByStudent } from '../../data/trips';
import { getProfileById } from '../../data/auth';
import MapPreview from '../../components/MapPreview';

export default function OrderDetailsScreen({ userProfile, tripId, onGoBack, onNavigate }) {
  const [trip, setTrip] = useState(null);
  const [driver, setDriver] = useState(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!tripId) {
      setLoading(false);
      return;
    }

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
        }
      } catch (e) {
        console.error('Failed to load trip:', e);
      }
      setLoading(false);
    })();
  }, [tripId]);

  const handleCancel = async () => {
    Alert.alert('Cancel Ride', 'Are you sure you want to cancel this ride?', [
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
              onGoBack();
            } else {
              Alert.alert('Error', 'Could not cancel trip. It may have already started.');
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
        <TouchableOpacity onPress={onGoBack}>
          <Text style={{ color: COLORS.primary }}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onGoBack}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Order Details</Text>
        </View>
        <TouchableOpacity style={styles.avatarBtn} onPress={() => onNavigate('Profile')}>
          {userProfile?.avatar_url ? (
            <Image source={{ uri: userProfile.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={[styles.avatar, styles.avatarDefault]}>
              <Text style={styles.avatarInitials}>
                {userProfile?.full_name ? userProfile.full_name.charAt(0).toUpperCase() : 'S'}
              </Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      <View style={styles.content}>
        {/* Status Badge */}
        <View style={styles.statusRow}>
          <View style={styles.statusBadgeAccepted}>
            <View style={styles.pulseDot} />
            <Text style={styles.statusTextAccepted}>Driver accepted your ride</Text>
          </View>
        </View>

        {/* Map Card */}
        {trip.pickup_lat && trip.pickup_lng && (
          <View style={[styles.mapCard, SHADOWS.diffusion]}>
            <View style={styles.mapContainer}>
              <MapPreview
                region={{
                  latitude: trip.pickup_lat,
                  longitude: trip.pickup_lng,
                  latitudeDelta: 0.03,
                  longitudeDelta: 0.03,
                }}
                markers={[
                  { id: 'pickup', coordinate: { latitude: trip.pickup_lat, longitude: trip.pickup_lng }, color: COLORS.primary },
                  ...(trip.dest_lat && trip.dest_lng
                    ? [{ id: 'dest', coordinate: { latitude: trip.dest_lat, longitude: trip.dest_lng }, color: '#006c49' }]
                    : []),
                ]}
              />
            </View>
          </View>
        )}

        {/* Driver Card */}
        {driver && (
          <View style={[styles.driverCard, SHADOWS.diffusion]}>
            <View style={styles.driverAvatarBg}>
              <MaterialIcons name="person" size={36} color={COLORS.primary} />
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
        )}

        {/* Trip Info Card */}
        <View style={[styles.tripCard, SHADOWS.diffusion]}>
          <Text style={styles.tripCardTitle}>Trip Information</Text>

          <View style={styles.tripInfo}>
            <View style={styles.tripInfoItem}>
              <View style={[styles.tripIconBg, { backgroundColor: COLORS.primaryFixed }]}>
                <MaterialIcons name="trip-origin" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.tripInfoTextWrap}>
                <Text style={styles.tripInfoLabel}>Pickup</Text>
                <Text style={styles.tripInfoText} numberOfLines={2}>{trip.pickup_text || 'Pickup'}</Text>
              </View>
            </View>

            <View style={styles.tripDivider} />

            <View style={styles.tripInfoItem}>
              <View style={[styles.tripIconBg, { backgroundColor: COLORS.errorContainer }]}>
                <MaterialIcons name="location-on" size={18} color={COLORS.error} />
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
            {trip.notes && (
              <View style={styles.tripMetaItem}>
                <MaterialIcons name="note" size={16} color={COLORS.onSurfaceVariant} />
                <Text style={styles.tripMetaText} numberOfLines={1}>{trip.notes}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Safety Card */}
        <View style={[styles.safetyCard, SHADOWS.diffusion]}>
          <MaterialIcons name="shield" size={24} color={COLORS.secondary} />
          <View style={styles.safetyTextWrap}>
            <Text style={styles.safetyTitle}>Safety Tips</Text>
            <Text style={styles.safetyText}>Share your trip status with a friend. Always verify the driver and plate number before boarding.</Text>
          </View>
        </View>
      </View>

      {/* Bottom Action */}
      <View style={styles.bottomAction}>
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
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
  header: {
    flexDirection: 'row',
    height: 60,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  headerIconBtn: {
    padding: SPACING.xs,
  },
  headerTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.primary,
    fontWeight: '800',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarDefault: {
    borderRadius: 20,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
    fontWeight: '700',
  },
  content: {
    flex: 1,
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: SPACING.md,
    gap: SPACING.md,
  },
  statusRow: {
    marginBottom: SPACING.xs,
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
    fontWeight: '600',
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: COLORS.secondary,
  },
  mapCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    overflow: 'hidden',
  },
  mapContainer: {
    height: 180,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  driverAvatarBg: {
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
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
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  tripCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
  },
  tripCardTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
    marginBottom: SPACING.md,
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
    fontWeight: '500',
    marginTop: 2,
  },
  tripDivider: {
    height: 1,
    backgroundColor: COLORS.outlineVariant,
    marginLeft: 52,
  },
  tripMetaRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
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
    borderWidth: 1,
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
  bottomAction: {
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 35,
    paddingTop: SPACING.md,
  },
  btnCancel: {
    flexDirection: 'row',
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.sm,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  btnCancelDisabled: {
    opacity: 0.6,
  },
  btnCancelText: {
    ...TYPOGRAPHY.button,
    color: COLORS.error,
  },
});
