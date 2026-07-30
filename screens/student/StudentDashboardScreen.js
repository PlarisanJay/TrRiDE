import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getTripById, subscribeToTrip } from '../../data/trips';
import { getProfileById } from '../../data/auth';

export default function StudentDashboardScreen({ userProfile, onNavigate, onBookRide, activeTripId, onViewTrip, onCancelTrip }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeDriver, setActiveDriver] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [showAcceptPopup, setShowAcceptPopup] = useState(false);
  const activeDriverRef = useRef(null);
  const profileFetchFailed = useRef(false);
  const prevStatusRef = useRef(null);

  const fetchTrip = useCallback(async () => {
    if (!activeTripId) return;
    try {
      const t = await getTripById(activeTripId);
      setActiveTrip(t);
      if (t && t.driver_id && !activeDriverRef.current && !profileFetchFailed.current) {
        try {
          const d = await getProfileById(t.driver_id);
          activeDriverRef.current = d;
          setActiveDriver(d);
        } catch (e) {
          console.warn('Could not load driver profile:', e.message);
          profileFetchFailed.current = true;
        }
      }
    } catch (e) {
      console.error('Failed to load active trip:', e);
    }
  }, [activeTripId]);

  useEffect(() => {
    if (!activeTripId) {
      setActiveTrip(null);
      setActiveDriver(null);
      activeDriverRef.current = null;
      profileFetchFailed.current = false;
      prevStatusRef.current = null;
      return;
    }

    profileFetchFailed.current = false;

    let unsub;
    let pollTimer;

    (async () => {
      setTripLoading(true);
      await fetchTrip();
      setTripLoading(false);
      prevStatusRef.current = activeTrip?.status || null;
    })();

    unsub = subscribeToTrip(activeTripId, async (updated) => {
      setActiveTrip(updated);
      if (updated.driver_id && !activeDriverRef.current && !profileFetchFailed.current) {
        try {
          const d = await getProfileById(updated.driver_id);
          activeDriverRef.current = d;
          setActiveDriver(d);
        } catch (e) {
          console.warn('Could not load driver profile:', e.message);
          profileFetchFailed.current = true;
        }
      }
    });

    pollTimer = setInterval(() => {
      fetchTrip();
    }, 5000);

    return () => {
      if (unsub) unsub();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [activeTripId, fetchTrip]);

  useEffect(() => {
    if (activeTrip && activeTrip.status === 'accepted' && activeDriver && prevStatusRef.current !== 'accepted') {
      setShowAcceptPopup(true);
      prevStatusRef.current = 'accepted';
    }
    if (activeTrip && activeTrip.status === 'pending') {
      prevStatusRef.current = 'pending';
    }
  }, [activeTrip, activeDriver]);

  const recentTrips = [
    { id: '1', destination: 'SM City Mall', date: 'Oct 12 • 4:20 PM' },
    { id: '2', destination: 'Main Campus Gate', date: 'Oct 11 • 8:15 AM' },
    { id: '3', destination: 'Blue Residence', date: 'Oct 10 • 9:30 PM' },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn}>
            <MaterialIcons name="menu" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TriRide</Text>
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

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeName}>Hello, {userProfile?.full_name?.split(' ')[0] || 'Student'}</Text>
          <Text style={styles.welcomeSubtitle}>Where are you heading today?</Text>
        </View>

        {activeTripId && activeTrip && activeTrip.status === 'pending' && (
          <View style={[styles.activeRideBanner, styles.pendingBanner, SHADOWS.diffusion]}>
            <View style={styles.activeRideLeft}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <View style={styles.activeRideTextWrap}>
                <Text style={styles.activeRideTitle}>Looking for a driver...</Text>
                <Text style={styles.activeRideSubtitle} numberOfLines={1}>
                  {activeTrip.pickup_text} → {activeTrip.dest_text}
                </Text>
              </View>
            </View>
              <TouchableOpacity style={styles.activeRideCancelBtn} onPress={() => { setShowAcceptPopup(false); onCancelTrip(); }}>
              <Text style={styles.activeRideCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTripId && activeTrip && activeTrip.status === 'accepted' && activeDriver && (
          <TouchableOpacity
            style={[styles.activeRideBanner, styles.acceptedBanner, SHADOWS.diffusion]}
            activeOpacity={0.8}
            onPress={() => onViewTrip(activeTripId)}
          >
            <View style={styles.activeRideLeft}>
              <View style={styles.acceptedDot} />
              <View style={styles.activeRideTextWrap}>
                <Text style={[styles.activeRideTitle, { color: COLORS.secondary }]}>Driver found!</Text>
                <Text style={styles.activeRideSubtitle}>
                  {activeDriver.full_name} • {activeDriver.vehicle_type || 'Tricycle'} • {activeDriver.plate_number || 'N/A'}
                </Text>
              </View>
            </View>
            <View style={styles.viewDetailsBtn}>
              <Text style={styles.viewDetailsText}>View Details</Text>
              <MaterialIcons name="chevron-right" size={18} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        )}

        {activeTripId && activeTrip && activeTrip.status === 'cancelled' && (
          <View style={[styles.activeRideBanner, styles.cancelledBanner]}>
            <MaterialIcons name="cancel" size={20} color={COLORS.error} />
            <Text style={styles.cancelledText}>Ride was cancelled</Text>
          </View>
        )}

        <View style={[styles.searchCard, SHADOWS.diffusion]}>
          <TouchableOpacity style={styles.searchBar} activeOpacity={0.8} onPress={onBookRide}>
            <MaterialIcons name="search" size={20} color={COLORS.primary} />
            <Text style={styles.searchText}>Where to?</Text>
          </TouchableOpacity>

          <View style={styles.quickLocations}>
            <TouchableOpacity style={styles.quickLocationBtn} onPress={onBookRide}>
              <View style={[styles.locationIconBg, { backgroundColor: COLORS.primaryFixed }]}>
                <MaterialIcons name="home" size={18} color={COLORS.primary} />
              </View>
              <View style={styles.quickLocationText}>
                <Text style={styles.quickLocationTitle}>Home</Text>
                <Text style={styles.quickLocationSubtitle}>University Residence Hall B</Text>
              </View>
            </TouchableOpacity>

            <View style={styles.quickDivider} />

            <TouchableOpacity style={styles.quickLocationBtn} onPress={onBookRide}>
              <View style={[styles.locationIconBg, { backgroundColor: COLORS.secondaryContainer }]}>
                <MaterialIcons name="school" size={18} color={COLORS.secondary} />
              </View>
              <View style={styles.quickLocationText}>
                <Text style={styles.quickLocationTitle}>Campus Library</Text>
                <Text style={styles.quickLocationSubtitle}>Main Academic Quad</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Trips</Text>
            <TouchableOpacity onPress={() => onNavigate('MyOrders')}>
              <Text style={styles.seeAllText}>History</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.tripsContainer}>
            {recentTrips.map((trip) => (
              <TouchableOpacity key={trip.id} style={styles.tripItem} activeOpacity={0.7} onPress={onBookRide}>
                <View style={styles.tripIconBg}>
                  <MaterialIcons name="directions-car" size={22} color={COLORS.outline} />
                </View>
                <View style={styles.tripDetails}>
                  <Text style={styles.tripDest}>{trip.destination}</Text>
                  <Text style={styles.tripDate}>{trip.date}</Text>
                </View>
                <MaterialIcons name="chevron-right" size={24} color={COLORS.outlineVariant} />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={[styles.section, { marginBottom: 100 }]}>
          <Text style={styles.sectionTitle}>Ride Safely</Text>
          <View style={styles.safetyGrid}>
            <View style={[styles.safetyCard, { backgroundColor: COLORS.primaryContainer }]}>
              <MaterialIcons name="shield" size={32} color="#ffffff" />
              <View>
                <Text style={styles.safetyCardTitle}>Emergency Support</Text>
                <Text style={styles.safetyCardCaption}>Direct link to campus security</Text>
              </View>
            </View>

            <View style={[styles.safetyCard, { backgroundColor: COLORS.secondaryContainer }]}>
              <MaterialIcons name="share-location" size={32} color={COLORS.onSecondaryContainer} />
              <View>
                <Text style={[styles.safetyCardTitle, { color: COLORS.onSecondaryContainer }]}>Share Status</Text>
                <Text style={[styles.safetyCardCaption, { color: COLORS.onSecondaryContainer, opacity: 0.8 }]}>Let friends know you're safe</Text>
              </View>
            </View>
          </View>
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => onNavigate('Home')}>
          <MaterialIcons name="home" size={24} color={COLORS.primary} />
          <Text style={[styles.navText, styles.navTextActive]}>Home</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => { setShowAcceptPopup(false); onNavigate('MyOrders'); }}>
          <MaterialIcons name="receipt-long" size={24} color={COLORS.onSurfaceVariant} />
          <Text style={styles.navText}>Orders</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={onBookRide}>
          <MaterialIcons name="directions-car" size={24} color={COLORS.onSurfaceVariant} />
          <Text style={styles.navText}>Bookings</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => { setShowAcceptPopup(false); onNavigate('Messages'); }}>
          <MaterialIcons name="chat" size={24} color={COLORS.onSurfaceVariant} />
          <Text style={styles.navText}>Messages</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.navItem} onPress={() => { setShowAcceptPopup(false); onNavigate('Profile'); }}>
          <MaterialIcons name="person" size={24} color={COLORS.onSurfaceVariant} />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>

      {/* Driver Acceptance Popup */}
      <Modal
        visible={showAcceptPopup}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAcceptPopup(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalIconCircle}>
              <MaterialIcons name="check-circle" size={48} color={COLORS.secondary} />
            </View>
            <Text style={styles.modalTitle}>Driver Found!</Text>
            <Text style={styles.modalSubtitle}>A driver has accepted your ride request.</Text>

            <View style={styles.modalDriverCard}>
              <View style={styles.modalDriverAvatar}>
                <MaterialIcons name="person" size={28} color={COLORS.primary} />
              </View>
              <View style={styles.modalDriverInfo}>
                <Text style={styles.modalDriverName}>{activeDriver?.full_name || 'Driver'}</Text>
                <Text style={styles.modalDriverVehicle}>
                  {activeDriver?.vehicle_type || 'Tricycle'} • {activeDriver?.plate_number || 'N/A'}
                </Text>
              </View>
            </View>

            {activeTrip && (
              <View style={styles.modalTripInfo}>
                <View style={styles.modalTripRow}>
                  <MaterialIcons name="trip-origin" size={14} color={COLORS.primary} />
                  <Text style={styles.modalTripText} numberOfLines={1}>{activeTrip.pickup_text}</Text>
                </View>
                <View style={styles.modalTripRow}>
                  <MaterialIcons name="location-on" size={14} color={COLORS.error} />
                  <Text style={styles.modalTripText} numberOfLines={1}>{activeTrip.dest_text}</Text>
                </View>
              </View>
            )}

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.modalBtnDismiss}
                activeOpacity={0.8}
                onPress={() => setShowAcceptPopup(false)}
              >
                <Text style={styles.modalBtnDismissText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.modalBtnView}
                activeOpacity={0.8}
                onPress={() => {
                  setShowAcceptPopup(false);
                  onViewTrip(activeTripId);
                }}
              >
                <Text style={styles.modalBtnViewText}>View Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
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
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
  scrollContent: {
    paddingTop: 76,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 40,
  },
  welcomeSection: {
    marginTop: SPACING.md,
    marginBottom: SPACING.lg,
  },
  welcomeName: {
    ...TYPOGRAPHY.headlineLgMobile,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  welcomeSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
  },
  searchCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  searchBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(115, 118, 134, 0.1)',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchText: {
    ...TYPOGRAPHY.body,
    color: COLORS.outline,
  },
  quickLocations: {
    marginTop: SPACING.md,
    gap: SPACING.sm,
  },
  quickLocationBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    gap: SPACING.md,
  },
  locationIconBg: {
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickLocationText: {
    flex: 1,
  },
  quickLocationTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  quickLocationSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  quickDivider: {
    height: 1,
    backgroundColor: 'rgba(195, 198, 215, 0.3)',
    marginLeft: 48,
  },
  section: {
    marginTop: SPACING.lg,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginBottom: SPACING.md,
  },
  sectionTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
  },
  seeAllText: {
    ...TYPOGRAPHY.button,
    fontSize: 14,
    color: COLORS.primary,
  },
  tripsContainer: {
    gap: SPACING.sm,
  },
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: 16,
    gap: SPACING.md,
  },
  tripIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: COLORS.surfaceContainerHigh,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tripDetails: {
    flex: 1,
  },
  tripDest: {
    ...TYPOGRAPHY.body,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  tripDate: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  safetyGrid: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
  },
  safetyCard: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 20,
    padding: SPACING.md,
    justifyContent: 'space-between',
  },
  safetyCardTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: '#ffffff',
    lineHeight: 18,
  },
  safetyCardCaption: {
    fontSize: 11,
    color: '#ffffff',
    opacity: 0.85,
    marginTop: 4,
  },
  bottomNav: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 75,
    backgroundColor: COLORS.surface,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 10,
    paddingBottom: 15,
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
  },
  navText: {
    ...TYPOGRAPHY.navLabel,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  navTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  activeRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  pendingBanner: {
    backgroundColor: 'rgba(0,74,198,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,74,198,0.2)',
  },
  acceptedBanner: {
    backgroundColor: 'rgba(0,108,73,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0,108,73,0.2)',
  },
  cancelledBanner: {
    backgroundColor: 'rgba(186,26,26,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(186,26,26,0.2)',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  activeRideLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: SPACING.md,
  },
  activeRideTextWrap: {
    flex: 1,
  },
  activeRideTitle: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.primary,
  },
  activeRideSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  activeRideCancelBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
  },
  activeRideCancelText: {
    ...TYPOGRAPHY.button,
    color: COLORS.error,
    fontSize: 14,
  },
  acceptedDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: COLORS.secondary,
  },
  viewDetailsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  viewDetailsText: {
    ...TYPOGRAPHY.button,
    color: COLORS.primary,
    fontSize: 14,
  },
  cancelledText: {
    ...TYPOGRAPHY.body,
    color: COLORS.error,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: ROUNDED.lg,
    width: '100%',
    maxWidth: 380,
    padding: SPACING.lg,
    alignItems: 'center',
    gap: SPACING.md,
  },
  modalIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0,108,73,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modalTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
    textAlign: 'center',
  },
  modalSubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
  },
  modalDriverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.surfaceContainerLow,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    width: '100%',
    gap: SPACING.md,
  },
  modalDriverAvatar: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalDriverInfo: {
    flex: 1,
  },
  modalDriverName: {
    ...TYPOGRAPHY.body,
    fontWeight: '700',
    color: COLORS.onSurface,
  },
  modalDriverVehicle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  modalTripInfo: {
    width: '100%',
    gap: SPACING.xs,
    paddingHorizontal: SPACING.sm,
  },
  modalTripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  modalTripText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    flex: 1,
  },
  modalActions: {
    flexDirection: 'row',
    width: '100%',
    gap: SPACING.sm,
    marginTop: SPACING.sm,
  },
  modalBtnDismiss: {
    flex: 1,
    height: 48,
    borderRadius: ROUNDED.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  modalBtnDismissText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  modalBtnView: {
    flex: 1.5,
    height: 48,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnViewText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
});
