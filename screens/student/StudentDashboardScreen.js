import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator, Modal, Animated, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, ELEVATION, GRADIENTS, INK, CANVAS, ACCENT, BORDERS } from '../../theme';
import { getTripById, subscribeToTrip, getTripsByStudent, cancelTripWithReason } from '../../data/trips';
import { getProfileById } from '../../data/auth';
import { getDriverAvailability } from '../../data/trips';
import { TripBannerSkeleton } from '../../components/SkeletonLoader';
import DriverStatusChip from '../../components/DriverStatusChip';
import TriRideTextLogo from '../../components/TriRideTextLogo';
import { sendLocalNotification } from '../../data/pushNotifications';
import UserAvatar from '../../components/UserAvatar';
import CancelRideModal from '../../components/CancelRideModal';
import { haversineDistance, formatDistanceText, formatDurationText } from '../../config/mapConfig';

// Nav tab definitions for the student dashboard
const NAV_TABS = [
  { key: 'Home', icon: 'home', label: 'Home' },
  { key: 'MyOrders', icon: 'receipt-long', label: 'Orders' },
  { key: 'Messages', icon: 'chat', label: 'Messages' },
  { key: 'Profile', icon: 'person', label: 'Profile' },
];

export default function StudentDashboardScreen({ userProfile, onNavigate, onBookRide, activeTripId, onViewTrip, onCancelTrip }) {
  const [activeTrip, setActiveTrip] = useState(null);
  const [activeDriver, setActiveDriver] = useState(null);
  const [tripLoading, setTripLoading] = useState(false);
  const [showAcceptPopup, setShowAcceptPopup] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [activeTab, setActiveTab] = useState('Home');
  const [availability, setAvailability] = useState({ total: 0, online: 0, onTrip: 0, available: 0 });
  const [recentTrips, setRecentTrips] = useState([]);
  const activeDriverRef = useRef(null);
  const profileFetchFailed = useRef(false);
  const prevStatusRef = useRef(null);

  // Load live driver availability (poll every 10s) and tick the count on change
  const liveDotScale = useRef(new Animated.Value(1)).current;
  const onlineCountTick = useRef(new Animated.Value(1)).current;
  const prevOnlineRef = useRef(null);

  // The dot dimmed as it grows, so it stops reading as a hard flash. At the
  // old 1.5 peak the 7px dot grew past its own 12px halo and the "radar"
  // effect was lost.
  const liveDotFade = useMemo(() => liveDotScale.interpolate({
    inputRange: [1, 1.22],
    outputRange: [1, 0.55],
    extrapolate: 'clamp',
  }), [liveDotScale]);

  // The count ticks up from below rather than the card scaling. Scaling a
  // view that contains text forces a re-rasterise, which made the 44px figure
  // and its label visibly shimmer on Android.
  const countTickStyle = useMemo(() => ({
    opacity: onlineCountTick,
    transform: [{
      translateY: onlineCountTick.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
    }],
  }), [onlineCountTick]);

  useEffect(() => {
    let mounted = true;
    async function loadAvailability() {
      try {
        const avail = await getDriverAvailability();
        if (!mounted) return;
        setAvailability(avail);
        if (prevOnlineRef.current !== null && prevOnlineRef.current !== avail.online) {
          onlineCountTick.setValue(0);
          Animated.timing(onlineCountTick, {
            toValue: 1,
            duration: 260,
            useNativeDriver: Platform.OS !== 'web',
          }).start();
        }
        prevOnlineRef.current = avail.online;
      } catch (e) {
        console.warn('Could not load driver availability:', e.message);
      }
    }
    loadAvailability();
    const timer = setInterval(loadAvailability, 10000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);

  // Continuous pulse for the LIVE dot
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(liveDotScale, { toValue: 1.22, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(liveDotScale, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== 'web' }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  // Load real recent trips
  useEffect(() => {
    let mounted = true;
    async function loadTrips() {
      try {
        const trips = await getTripsByStudent(userProfile?.id);
        if (!mounted) return;
        const completed = trips
          .filter((t) => t.status === 'completed')
          .slice(0, 3)
          .map((t) => ({
            id: t.id,
            destination: t.dest_text || 'Destination',
            date: t.created_at ? new Date(t.created_at).toLocaleDateString() : '',
          }));
        setRecentTrips(completed);
      } catch (e) {
        console.warn('Could not load recent trips:', e.message);
      }
    }
    if (userProfile?.id) loadTrips();
    return () => { mounted = false; };
  }, [userProfile?.id]);

  // Per-tab animated scale for press bounce
  const tabScales = useRef(
    NAV_TABS.reduce((acc, tab) => {
      acc[tab.key] = new Animated.Value(1);
      return acc;
    }, {})
  ).current;

  // FAB scale animation
  const fabScale = useRef(new Animated.Value(1)).current;

  const animateTabPress = (key) => {
    Animated.sequence([
      Animated.spring(tabScales[key], { toValue: 0.88, useNativeDriver: Platform.OS !== 'web', speed: 80 }),
      Animated.spring(tabScales[key], { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 60 }),
    ]).start();
  };

  const handleNavPress = (key) => {
    animateTabPress(key);
    setActiveTab(key);
    setShowAcceptPopup(false);
    onNavigate(key);
  };

  const handleFabPressIn = () => {
    Animated.spring(fabScale, { toValue: 0.88, useNativeDriver: true, speed: 50 }).start();
  };
  const handleFabPressOut = () => {
    Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, speed: 30 }).start();
  };

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
      sendLocalNotification(
        'Ride Accepted! 🚗',
        `${activeDriver.full_name || 'A driver'} has accepted your ride request.`,
        { tripId: activeTrip.id }
      );
      prevStatusRef.current = 'accepted';
    }
    if (activeTrip && activeTrip.status === 'pending') {
      prevStatusRef.current = 'pending';
    }
  }, [activeTrip, activeDriver]);

  const activeTripDistInfo = useMemo(() => {
    if (!activeTrip?.pickup_lat || !activeTrip?.dest_lat) return null;
    const distKm = haversineDistance(activeTrip.pickup_lat, activeTrip.pickup_lng, activeTrip.dest_lat, activeTrip.dest_lng);
    const distText = formatDistanceText(Math.round(distKm * 1000));
    const estMins = Math.max(1, Math.round(distKm * 3));
    const durationText = formatDurationText(estMins);
    return `${distText} • ${durationText}`;
  }, [activeTrip?.pickup_lat, activeTrip?.pickup_lng, activeTrip?.dest_lat, activeTrip?.dest_lng]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TriRideTextLogo size="small" />
        <TouchableOpacity style={styles.avatarBtn} onPress={() => onNavigate('Profile')} activeOpacity={0.8}>
          <UserAvatar
            uri={userProfile?.avatar_url}
            name={userProfile?.full_name || 'Student'}
            size={40}
          />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeName}>Hello, {userProfile?.full_name?.split(' ')[0] || 'Student'}</Text>
          <Text style={styles.welcomeSubtitle}>Where are you heading today?</Text>
        </View>

        {tripLoading && activeTripId && <TripBannerSkeleton />}

        {!tripLoading && activeTripId && activeTrip && activeTrip.status === 'pending' && (
          <View style={[styles.activeRideBanner, styles.pendingBanner]}>
            <View style={styles.activeRideLeft}>
              <ActivityIndicator size="small" color={COLORS.primary} />
              <View style={styles.activeRideTextWrap}>
                <Text style={styles.activeRideTitle}>Looking for a driver...</Text>
                <Text style={styles.activeRideSubtitle} numberOfLines={1}>
                  {activeTrip.pickup_text} → {activeTrip.dest_text}
                </Text>
                {activeTripDistInfo && (
                  <Text style={styles.activeRideMetaText}>
                    📍 {activeTripDistInfo}
                  </Text>
                )}
              </View>
            </View>
            <TouchableOpacity
              style={styles.activeRideCancelBtn}
              onPress={() => setShowCancelModal(true)}
            >
              <Text style={styles.activeRideCancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        )}

        {activeTripId && activeTrip && activeTrip.status === 'accepted' && activeDriver && (
          <TouchableOpacity
            style={[styles.activeRideBanner, styles.acceptedBanner]}
            activeOpacity={0.8}
            onPress={() => onViewTrip(activeTripId)}
          >
            <View style={styles.activeRideLeft}>
              <UserAvatar
                uri={activeDriver.avatar_url}
                name={activeDriver.full_name || 'Driver'}
                size={38}
              />
              <View style={styles.activeRideTextWrap}>
                <Text style={[styles.activeRideTitle, { color: COLORS.secondary }]}>Driver found!</Text>
                <Text style={styles.activeRideSubtitle}>
                  {activeDriver.full_name} • {activeDriver.vehicle_type || 'Tricycle'} • {activeDriver.plate_number || 'N/A'}
                </Text>
                {activeTripDistInfo && (
                  <Text style={styles.activeRideMetaText}>
                    📍 {activeTripDistInfo}
                  </Text>
                )}
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
            <Text style={[styles.cancelledText, { flex: 1 }]}>
              {activeTrip.notes && activeTrip.notes.includes('[Cancelled')
                ? activeTrip.notes.split('\n').filter((n) => n.includes('[Cancelled')).pop().replace(/[\[\]]/g, '')
                : 'Ride was cancelled'}
            </Text>
            <TouchableOpacity onPress={onCancelTrip} style={{ padding: 4 }}>
              <MaterialIcons name="close" size={18} color={COLORS.error} />
            </TouchableOpacity>
          </View>
        )}

        {activeTripId && activeTrip && activeTrip.status === 'completed' && (
          <TouchableOpacity
            style={[styles.activeRideBanner, styles.completedBanner]}
            activeOpacity={0.8}
            onPress={() => onViewTrip(activeTripId)}
          >
            <View style={styles.activeRideLeft}>
              <MaterialIcons name="star" size={20} color={ACCENT.amber} />
              <View style={styles.activeRideTextWrap}>
                <Text style={[styles.activeRideTitle, { color: ACCENT.orangeDeep }]}>Ride completed!</Text>
                <Text style={styles.activeRideSubtitle}>Tap to rate your driver</Text>
              </View>
            </View>
            <View style={styles.viewDetailsBtn}>
              <Text style={styles.viewDetailsText}>Rate Driver</Text>
              <MaterialIcons name="chevron-right" size={18} color={COLORS.primary} />
            </View>
          </TouchableOpacity>
        )}

        <LinearGradient
          {...GRADIENTS.wash}
          style={[styles.searchCard, ELEVATION.md]}
        >
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
        </LinearGradient>

        {/* Live Driver Status */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Live Drivers</Text>
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDotWrap, { transform: [{ scale: liveDotScale }] }]}>
                <Animated.View style={[styles.liveDot, { opacity: liveDotFade }]} />
              </Animated.View>
              <Text style={styles.liveBadgeText}>LIVE</Text>
            </View>
          </View>

          <View style={[styles.availabilityCard, ELEVATION.sm]}>
            <View style={styles.availabilityMain}>
              <Animated.View style={[styles.availabilityNumberWrap, countTickStyle]}>
                <Text style={styles.availabilityNumber}>{availability.online}</Text>
                <Text style={styles.availabilityUnit}>drivers online</Text>
              </Animated.View>
              <Text style={styles.availabilitySub}>of {availability.total} registered drivers</Text>
            </View>

            <View style={styles.availabilityChips}>
              <DriverStatusChip variant="waiting" count={availability.available} />
              <DriverStatusChip variant="ontrip" count={availability.onTrip} />
            </View>
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
            <LinearGradient
              {...GRADIENTS.brand}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.safetyCard, ELEVATION.sm]}
            >
              <MaterialIcons name="shield" size={32} color={CANVAS.raised} />
              <View>
                <Text style={styles.safetyCardTitle}>Emergency Support</Text>
                <Text style={styles.safetyCardCaption}>Direct link to campus security</Text>
              </View>
            </LinearGradient>

            <LinearGradient
              colors={[ACCENT.greenSoft, ACCENT.greenWash]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.safetyCard, ELEVATION.sm]}
            >
              <MaterialIcons name="share-location" size={32} color={ACCENT.green} />
              <View>
                <Text style={[styles.safetyCardTitle, { color: ACCENT.greenInk }]}>Share Status</Text>
                <Text style={[styles.safetyCardCaption, { color: ACCENT.greenInkMuted, opacity: 0.8 }]}>Let friends know you're safe</Text>
              </View>
            </LinearGradient>
          </View>
        </View>
      </ScrollView>

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
                <LinearGradient {...GRADIENTS.brand} style={styles.modalBtnView}>
                  <Text style={styles.modalBtnViewText}>View Details</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CancelRideModal
        visible={showCancelModal}
        role="student"
        tripStatus={activeTrip?.status || 'pending'}
        onClose={() => setShowCancelModal(false)}
        onConfirm={async (reason) => {
          if (!activeTripId) return;
          setCancelling(true);
          try {
            await cancelTripWithReason({
              tripId: activeTripId,
              role: 'student',
              reason,
            });
            setShowCancelModal(false);
            onCancelTrip();
          } catch (e) {
            console.warn('Failed to cancel trip:', e);
          } finally {
            setCancelling(false);
          }
        }}
        loading={cancelling}
      />
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
    // Was a hard 1px COLORS.outlineVariant rule under a flat fill. A soft
    // hairline plus ELEVATION.sm lets the header float over the content.
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(15, 23, 42, 0.05)',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  // logoBadge / brandContainer / brandText / brandTextAccent / avatarDefault /
  // avatarInitials / avatar were removed: the header renders TriRideTextLogo
  // and UserAvatar, so these had 0 references.
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  scrollContent: {
    paddingTop: 76,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 95,
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
  // The fill itself is a GRADIENTS.wash LinearGradient now, so the style
  // only carries shape and depth. The old pair of 1px outlineVariant
  // borders is what made this card look drawn rather than lifted.
  searchCard: {
    borderRadius: ROUNDED.lg,
    padding: SPACING.md,
    marginBottom: SPACING.lg,
  },
  searchBar: {
    flexDirection: 'row',
    // A raised white pill sitting on the tinted card reads as an input
    // without needing a hard outline around it.
    backgroundColor: CANVAS.raised,
    ...ELEVATION.xs,
    height: 48,
    borderRadius: 12,
    ...BORDERS.hair,
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    gap: SPACING.sm,
  },
  searchText: {
    ...TYPOGRAPHY.body,
    color: INK.subtle,
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
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(15, 23, 42, 0.08)',
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
    color: ACCENT.blueDeep,
  },
  tripsContainer: {
    gap: SPACING.sm,
  },
  tripItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: SPACING.md,
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: 16,
    gap: SPACING.md,
  },
  tripIconBg: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: CANVAS.sunken,
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
    color: CANVAS.raised,
    lineHeight: 18,
  },
  safetyCardCaption: {
    fontSize: 11,
    color: CANVAS.raised,
    opacity: 0.85,
    marginTop: 4,
  },
  // bottomNavWrapper / bottomNav / navItem / navPill / navFabPlaceholder /
  // navText / navTextActive / fabWrapper / fab were removed. App.js renders
  // components/BottomNavBar, so this screen had a second, stale copy of the
  // navbar stylesheet with zero references.
  activeRideBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  // Tinted status fills. These were 8%-alpha backgrounds paired with a
  // matching 20-35% alpha border, which is the "hard stroke" look; the
  // hairline keeps the state readable without drawing a box around it.
  pendingBanner: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    ...BORDERS.accent,
  },
  acceptedBanner: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(22, 163, 74, 0.22)',
  },
  cancelledBanner: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(239, 68, 68, 0.22)',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  completedBanner: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(245, 158, 11, 0.24)',
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
    color: ACCENT.blueDeep,
  },
  activeRideSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  activeRideMetaText: {
    ...TYPOGRAPHY.caption,
    color: ACCENT.blueDeep,
    fontWeight: '700',
    fontSize: 11,
    marginTop: 3,
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
    backgroundColor: 'rgba(10, 15, 30, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  modalContent: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.lg,
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
    backgroundColor: ACCENT.blueSoft,
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
    ...BORDERS.strong,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: CANVAS.raised,
  },
  modalBtnDismissText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  modalBtnView: {
    flex: 1.5,
    height: 48,
    borderRadius: ROUNDED.md,
    // borderRadius does not clip children in React Native; without this the
    // gradient fill renders with square corners.
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalBtnViewText: {
    ...TYPOGRAPHY.button,
    color: CANVAS.raised,
  },
  // Live Driver Status
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
  },
  liveDotWrap: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'rgba(34, 197, 94, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  liveDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: ACCENT.greenBright,
  },
  liveBadgeText: {
    ...TYPOGRAPHY.button,
    fontSize: 12,
    fontWeight: '800',
    color: ACCENT.green,
    letterSpacing: 0.6,
  },
  availabilityCard: {
    backgroundColor: CANVAS.raised,
    ...ELEVATION.sm,
    borderRadius: 20,
    padding: SPACING.lg,
    gap: SPACING.md,
  },
  availabilityMain: {
    alignItems: 'center',
  },
  availabilityNumberWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  availabilityNumber: {
    ...TYPOGRAPHY.headlineLgMobile,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: '800',
    color: ACCENT.blueDeep,
  },
  availabilityUnit: {
    ...TYPOGRAPHY.button,
    fontWeight: '700',
    color: COLORS.onSurface,
    fontSize: 15,
  },
  availabilitySub: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  availabilityChips: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
});
