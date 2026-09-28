import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Animated, ActivityIndicator, Alert, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getPendingTrips, acceptTrip, declineTrip, subscribeToPendingTrips, subscribeToDriverTrips, getTripById, getDriverStats, getTripsByDriver, getDriverActivePassengerCount, MAX_PASSENGERS } from '../../data/trips';
import { getProfileById } from '../../data/auth';
import { getOrCreateConversation } from '../../data/messages';
import { saveActiveTrip, clearActiveTrip } from '../../data/activeTripStore';
import { saveCancelledTrip } from '../../data/cancelledTripsStore';
import { getDriverRating } from '../../data/ratings';
import { RequestCardSkeleton } from '../../components/SkeletonLoader';
import TriRideTextLogo from '../../components/TriRideTextLogo';
import UserAvatar from '../../components/UserAvatar';
import { haversineDistance, formatDistanceText, formatDurationText } from '../../config/mapConfig';

const NAV_TABS = [
  { key: 'Home', icon: 'home', label: 'Home' },
  { key: 'Messages', icon: 'chat', label: 'Messages' },
  { key: 'Profile', icon: 'person', label: 'Profile' },
];

export default function DriverDashboardScreen({ userProfile, activeTripId, onAcceptRide, onNavigate, isOnline }) {
  const [pendingTrips, setPendingTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [acceptingId, setAcceptingId] = useState(null);
  const [decliningId, setDecliningId] = useState(null);
  const [tripStudents, setTripStudents] = useState({});
  const tripStudentsRef = useRef({});
  const [activeTab, setActiveTab] = useState('Home');
  const [activeTrip, setActiveTrip] = useState(null);
  const [driverStats, setDriverStats] = useState({ completedRides: 0, ongoingCount: 0, rating: '—' });
  const [currentPassengers, setCurrentPassengers] = useState(0);
  const currentPassengersRef = useRef(0);

  // Load real driver stats
  useEffect(() => {
    let mounted = true;
    async function loadStats() {
      try {
        const stats = await getDriverStats(userProfile?.id);
        if (mounted) setDriverStats((prev) => ({ ...prev, ...stats }));
      } catch (e) {
        console.warn('Could not load driver stats:', e.message);
      }
      try {
        const trips = await getTripsByDriver(userProfile?.id);
        if (mounted) {
          const ongoing = (trips || []).filter((t) => t.status === 'accepted' || t.status === 'in_progress').length;
          setDriverStats((prev) => ({ ...prev, ongoingCount: ongoing }));
        }
      } catch (e) {
        console.warn('Could not load ongoing trips:', e.message);
      }
      try {
        const rating = await getDriverRating(userProfile?.id);
        if (mounted) {
          setDriverStats((prev) => ({
            ...prev,
            rating: rating && rating.count > 0 ? rating.average.toFixed(1) : '—',
          }));
        }
      } catch (e) {
        console.warn('Could not load driver rating:', e.message);
      }
    }
    if (userProfile?.id) loadStats();
    return () => { mounted = false; };
  }, [userProfile?.id]);

  // Load current passenger capacity
  const refreshPassengerCount = async () => {
    if (!userProfile?.id) return 0;
    try {
      const count = await getDriverActivePassengerCount(userProfile.id);
      currentPassengersRef.current = count;
      setCurrentPassengers(count);
      return count;
    } catch (e) {
      console.warn('Could not load passenger count:', e.message);
      return currentPassengersRef.current;
    }
  };

  useEffect(() => {
    refreshPassengerCount();
  }, [userProfile?.id]);

  // Per-tab scale animations
  const tabScales = useRef(
    NAV_TABS.reduce((acc, tab) => {
      acc[tab.key] = new Animated.Value(1);
      return acc;
    }, {})
  ).current;

  const handleNavPress = (key) => {
    Animated.sequence([
      Animated.spring(tabScales[key], { toValue: 0.88, useNativeDriver: Platform.OS !== 'web', speed: 80 }),
      Animated.spring(tabScales[key], { toValue: 1, useNativeDriver: Platform.OS !== 'web', speed: 60 }),
    ]).start();
    setActiveTab(key);
    onNavigate(key);
  };

  useEffect(() => {
    loadPendingTrips(true);
    if (activeTripId) {
      loadActiveTrip(activeTripId);
    }

    const unsubPending = subscribeToPendingTrips(async (payload) => {
      const eventType = payload?.eventType || (payload?.id ? 'INSERT' : null);
      const trip = payload?.new || payload;

      if (eventType === 'INSERT') {
        if (trip?.status === 'pending') {
          const needed = trip?.passengers || 1;
          const currentCount = currentPassengersRef.current;
          const available = Math.max(0, MAX_PASSENGERS - currentCount);

          // Rule: If driver is at max capacity (7/7) or if the trip needs more seats than available,
          // this driver CANNOT receive it! It goes to other drivers who have enough seats.
          if (available <= 0 || needed > available) {
            return;
          }

          setPendingTrips((prev) => {
            if (prev.some((t) => t.id === trip.id)) return prev;
            return [trip, ...prev];
          });
          fetchStudentForTrip(trip);
        }
      } else if (eventType === 'UPDATE') {
        if (trip?.status === 'pending') {
          const needed = trip?.passengers || 1;
          const currentCount = currentPassengersRef.current;
          const available = Math.max(0, MAX_PASSENGERS - currentCount);

          if (available <= 0 || needed > available) {
            // Exceeds available capacity -> remove from this driver's screen
            setPendingTrips((prev) => prev.filter((t) => t.id !== trip.id));
          } else {
            setPendingTrips((prev) =>
              prev.map((t) => (t.id === trip.id ? { ...t, ...trip } : t))
            );
            fetchStudentForTrip(trip);
          }
        } else {
          // Status is no longer pending (cancelled or accepted) -> remove cleanly
          setPendingTrips((prev) => prev.filter((t) => t.id !== trip.id));
        }
      } else if (eventType === 'DELETE') {
        const deletedId = payload?.old?.id || trip?.id;
        if (deletedId) {
          setPendingTrips((prev) => prev.filter((t) => t.id !== deletedId));
        }
      }
    });

    // Real-time capacity listener: when driver completes, starts, or accepts a trip
    const unsubDriverTrips = subscribeToDriverTrips(userProfile?.id, () => {
      refreshPassengerCount().then((newCount) => {
        const available = Math.max(0, MAX_PASSENGERS - (newCount || 0));
        setPendingTrips((prev) => {
          if (available <= 0) return [];
          return prev.filter((t) => (t.passengers || 1) <= available);
        });
        loadPendingTrips(false);
      });
    });

    // 15-second silent background poll that NEVER wipes cards or shows skeletons
    const pollTimer = setInterval(() => {
      loadPendingTrips(false);
      if (activeTripId) loadActiveTrip(activeTripId);
    }, 15000);

    return () => {
      if (unsubPending) unsubPending();
      if (unsubDriverTrips) unsubDriverTrips();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [activeTripId, userProfile?.id]);

  const loadActiveTrip = async (id) => {
    try {
      const trip = await getTripById(id);
      if (trip && (trip.status === 'accepted' || trip.status === 'in_progress')) {
        setActiveTrip(trip);
      } else {
        setActiveTrip(null);
      }
    } catch (e) {}
  };

  const loadPendingTrips = async (isInitial = false) => {
    if (isInitial) setLoadingTrips(true);
    try {
      const activeCount = await refreshPassengerCount();
      const available = Math.max(0, MAX_PASSENGERS - (activeCount ?? currentPassengersRef.current));

      if (available <= 0) {
        // Driver is at maximum capacity (7/7) - cannot receive any pending trips!
        setPendingTrips([]);
        if (isInitial) setLoadingTrips(false);
        return;
      }

      // Query only trips that fit this driver's available seats
      const trips = await getPendingTrips(available);
      const suitableTrips = (trips || []).filter((t) => (t.passengers || 1) <= available);

      setPendingTrips((prev) => {
        if (
          prev.length === suitableTrips.length &&
          prev.every((p, idx) => p.id === suitableTrips[idx]?.id && p.status === suitableTrips[idx]?.status && p.updated_at === suitableTrips[idx]?.updated_at)
        ) {
          return prev;
        }
        return suitableTrips;
      });

      suitableTrips.forEach((t) => {
        if (t?.student_id && !tripStudentsRef.current[t.student_id]) {
          fetchStudentForTrip(t);
        }
      });
    } catch (e) {
      console.log('loadPendingTrips error:', e?.message);
    } finally {
      if (isInitial) setLoadingTrips(false);
    }
  };

  const fetchStudentForTrip = async (trip) => {
    const studentId = trip?.student_id;
    if (!studentId || tripStudentsRef.current[studentId]) return;
    tripStudentsRef.current[studentId] = { loading: true };
    try {
      const student = await getProfileById(studentId);
      if (student) {
        tripStudentsRef.current[studentId] = student;
        setTripStudents((prev) => ({ ...prev, [studentId]: student }));
      }
    } catch (e) {
      delete tripStudentsRef.current[studentId];
    }
  };

  const handleAccept = async (tripId) => {
    if (acceptingId) return;
    const trip = pendingTrips.find((t) => t.id === tripId);
    const needed = trip?.passengers || 1;
    const currentCount = currentPassengersRef.current;

    // Strict capacity validation
    if (currentCount + needed > MAX_PASSENGERS) {
      Alert.alert(
        'Capacity Exceeded',
        `You currently have ${currentCount}/${MAX_PASSENGERS} passengers. This ride requires ${needed} seat${needed > 1 ? 's' : ''}. Complete a drop-off first.`
      );
      setPendingTrips((prev) => prev.filter((t) => t.id !== tripId));
      return;
    }

    setAcceptingId(tripId);
    try {
      // Pre-save active trip to local storage so CurrentTripScreen has it immediately
      const optimisticTrip = {
        ...(trip || {}),
        id: tripId,
        driver_id: userProfile?.id,
        status: 'accepted',
      };
      await saveActiveTrip(optimisticTrip);

      // Update local passenger count & available capacity immediately
      const newPassengerTotal = currentCount + needed;
      currentPassengersRef.current = newPassengerTotal;
      setCurrentPassengers(newPassengerTotal);

      // Remove this trip and filter out any other pending trips that now exceed the new capacity
      const newAvailable = Math.max(0, MAX_PASSENGERS - newPassengerTotal);
      setPendingTrips((prev) => {
        if (newAvailable <= 0) return [];
        return prev.filter((t) => t.id !== tripId && (t.passengers || 1) <= newAvailable);
      });

      // Fast DB update with known passenger count
      const acceptedTrip = await acceptTrip(tripId, userProfile.id, trip?.passengers);
      if (acceptedTrip) {
        saveActiveTrip(acceptedTrip).catch(() => {});
      }

      // Non-blocking background operations
      if (trip?.student_id) {
        getOrCreateConversation(tripId, trip.student_id, userProfile.id).catch(() => {});
      }
      refreshPassengerCount().catch(() => {});

      // Immediately navigate to CurrentTripScreen with ZERO delay!
      onAcceptRide(tripId);
    } catch (e) {
      console.log('handleAccept error:', e?.message);
      clearActiveTrip().catch(() => {});
      loadPendingTrips(false);
      Alert.alert('Cannot Accept', e?.message || 'Could not accept this trip. Please try again.');
    } finally {
      setAcceptingId(null);
    }
  };

  const handleDecline = async (tripId) => {
    if (decliningId) return;
    setDecliningId(tripId);
    try {
      const trip = pendingTrips.find((t) => t.id === tripId);
      setPendingTrips((prev) => prev.filter((t) => t.id !== tripId));
      await declineTrip(tripId);
      if (trip) {
        saveCancelledTrip(trip).catch(() => {});
      }
      refreshPassengerCount().catch(() => {});
    } catch (e) {
      console.log('handleDecline error:', e?.message);
      loadPendingTrips(false);
      Alert.alert('Error', 'Could not decline this trip. Please try again.');
    } finally {
      setDecliningId(null);
    }
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TriRideTextLogo size="small" showTag={true} tagText="DRIVER" />
        <View style={styles.headerRight}>
          <View style={[styles.statusPill, isOnline ? styles.statusPillOnline : styles.statusPillOffline]}>
            <View style={[styles.statusDot, { backgroundColor: isOnline ? '#22c55e' : COLORS.outline }]} />
            <Text style={[styles.statusPillText, { color: isOnline ? COLORS.secondary : COLORS.onSurfaceVariant }]}>
              {isOnline ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => onNavigate('Profile')} activeOpacity={0.8}>
            <UserAvatar
              uri={userProfile?.avatar_url}
              name={userProfile?.full_name || 'Driver'}
              size={40}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Welcome Section */}
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeName}>Hello, {userProfile?.full_name?.split(' ')[0] || 'Driver'}!</Text>
          <Text style={styles.welcomeSubtitle}>
            Status:{' '}
            <Text style={[styles.statusTextBold, { color: isOnline ? COLORS.secondary : COLORS.outline }]}>
              {isOnline ? 'Online & Ready for Rides' : 'Offline (Resting)'}
            </Text>
          </Text>
        </View>

        {/* Quick Driver Stats */}
        <View style={[styles.statsRow, SHADOWS.card]}>
          <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => onNavigate('DriverCompletedRides')}>
            <MaterialIcons name="check-circle" size={20} color={COLORS.primary} />
            <Text style={styles.statNumber}>{driverStats.completedRides}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <TouchableOpacity style={styles.statCard} activeOpacity={0.7} onPress={() => onNavigate('DriverTrips')}>
            <MaterialIcons name="directions-car" size={20} color={COLORS.secondary} />
            <Text style={styles.statNumber}>{driverStats.ongoingCount}</Text>
            <Text style={styles.statLabel}>Ongoing</Text>
            {driverStats.ongoingCount > 0 && <View style={styles.redMark} />}
          </TouchableOpacity>

          <View style={styles.statDivider} />

          <View style={styles.statCard}>
            <MaterialIcons name="star" size={20} color="#f59e0b" />
            <Text style={styles.statNumber}>{driverStats.rating}</Text>
            <Text style={styles.statLabel}>Ratings</Text>
          </View>

          <View style={styles.statDivider} />

          <View style={styles.statCard}>
            <MaterialIcons name="people" size={20} color={currentPassengers >= MAX_PASSENGERS ? COLORS.error : COLORS.primary} />
            <Text style={[styles.statNumber, currentPassengers >= MAX_PASSENGERS && { color: COLORS.error }]}>
              {currentPassengers}/{MAX_PASSENGERS}
            </Text>
            <Text style={styles.statLabel}>Passengers</Text>
            {currentPassengers >= MAX_PASSENGERS && <View style={styles.redMark} />}
          </View>
        </View>

        {/* Persistent Ongoing Ride Banner (if active) */}
        {activeTrip && (
          <TouchableOpacity
            style={[styles.ongoingBanner, SHADOWS.card]}
            activeOpacity={0.9}
            onPress={() => onAcceptRide(activeTrip.id)}
          >
            <View style={styles.ongoingLeft}>
              <View style={styles.pulseDot} />
              <View>
                <Text style={styles.ongoingTitle}>Ongoing Trip in Progress</Text>
                <Text style={styles.ongoingSub}>
                  {activeTrip.pickup_text} → {activeTrip.dest_text}
                </Text>
              </View>
            </View>
            <View style={styles.resumeBtn}>
              <Text style={styles.resumeBtnText}>Resume</Text>
              <MaterialIcons name="arrow-forward" size={16} color="#ffffff" />
            </View>
          </TouchableOpacity>
        )}

        {/* Incoming Ride Requests */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Incoming Requests</Text>
              {currentPassengers < MAX_PASSENGERS && (
                <Text style={styles.capacityHint}>
                  {MAX_PASSENGERS - currentPassengers} seat{MAX_PASSENGERS - currentPassengers > 1 ? 's' : ''} available
                </Text>
              )}
            </View>
            <Text style={styles.seeAllText}>
              {currentPassengers >= MAX_PASSENGERS ? 'Capacity full' : `${pendingTrips.length} matching`}
            </Text>
          </View>

          {currentPassengers >= MAX_PASSENGERS ? (
            <View style={styles.maxCapacityState}>
              <View style={styles.maxCapacityIconBg}>
                <MaterialIcons name="people-alt" size={32} color="#dc2626" />
              </View>
              <Text style={styles.maxCapacityTitle}>Maximum Capacity Reached (7/7)</Text>
              <Text style={styles.maxCapacityDesc}>
                You currently have 7 passengers. New ride requests are routed to other available drivers until you complete your drop-offs.
              </Text>
            </View>
          ) : loadingTrips ? (
            <>
              <RequestCardSkeleton />
              <RequestCardSkeleton />
            </>
          ) : pendingTrips.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="directions-bike" size={48} color={COLORS.outlineVariant} />
              <Text style={styles.emptyText}>No matching ride requests right now</Text>
              <Text style={styles.emptySubText}>
                Seats available: {MAX_PASSENGERS - currentPassengers} of {MAX_PASSENGERS}
              </Text>
            </View>
          ) : (
            pendingTrips.map((trip) => {
              const student = tripStudents[trip.student_id];
              const distKm = (trip.pickup_lat && trip.dest_lat)
                ? haversineDistance(trip.pickup_lat, trip.pickup_lng, trip.dest_lat, trip.dest_lng)
                : null;
              const distText = distKm !== null ? formatDistanceText(Math.round(distKm * 1000)) : null;
              const estMins = distKm !== null ? Math.max(1, Math.round(distKm * 3)) : null;
              const durationText = estMins !== null ? formatDurationText(estMins) : null;

              return (
                <View key={trip.id} style={[styles.requestCard, SHADOWS.diffusion]}>
                  <View style={styles.requestHeader}>
                    <View style={styles.passengerRow}>
                      <UserAvatar
                        uri={student?.avatar_url}
                        name={student?.full_name || 'Student Rider'}
                        size={40}
                      />
                      <View style={styles.passengerDetails}>
                        <Text style={styles.passengerName}>{student?.full_name || 'Student Rider'}</Text>
                        <Text style={styles.passengerSubText}>{trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.tripLocations}>
                    <View style={styles.locationItem}>
                      <MaterialIcons name="trip-origin" size={18} color={COLORS.secondary} />
                      <View style={styles.locationTextWrapper}>
                        <Text style={styles.locationTitle}>Pickup Point</Text>
                        <Text style={styles.locationAddress}>{trip.pickup_text || 'Location'}</Text>
                      </View>
                    </View>

                    <View style={styles.locationItem}>
                      <MaterialIcons name="location-on" size={18} color={COLORS.error} />
                      <View style={[styles.locationTextWrapper, { borderBottomWidth: 0 }]}>
                        <Text style={styles.locationTitle}>Destination</Text>
                        <Text style={styles.locationAddress}>{trip.dest_text || 'Location'}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Trip Distance & Estimated Travel Time Badge */}
                  {distText && durationText && (
                    <View style={styles.tripMetaBadgeRow}>
                      <View style={styles.tripMetaBadge}>
                        <MaterialIcons name="straighten" size={14} color="#2563eb" />
                        <Text style={styles.tripMetaBadgeText}>{distText}</Text>
                      </View>
                      <View style={[styles.tripMetaBadge, { backgroundColor: '#fff7ed', borderColor: '#fed7aa' }]}>
                        <MaterialIcons name="schedule" size={14} color="#ea580c" />
                        <Text style={[styles.tripMetaBadgeText, { color: '#9a3412' }]}>{durationText}</Text>
                      </View>
                    </View>
                  )}

                  {trip.notes ? (
                    <Text style={styles.notesText}>Note: {trip.notes}</Text>
                  ) : null}

                  {/* High clarity, friendly action buttons */}
                  <View style={styles.requestActions}>
                    <TouchableOpacity
                      style={styles.btnDecline}
                      activeOpacity={0.8}
                      disabled={decliningId === trip.id || acceptingId === trip.id}
                      onPress={() => handleDecline(trip.id)}
                    >
                      {decliningId === trip.id ? (
                        <ActivityIndicator size="small" color={COLORS.primary} />
                      ) : (
                        <Text style={styles.btnDeclineText}>Decline</Text>
                      )}
                    </TouchableOpacity>

                    {currentPassengers + (trip.passengers || 1) > MAX_PASSENGERS ? (
                      <View style={[styles.btnAccept, styles.btnAcceptFull]}>
                        <MaterialIcons name="block" size={18} color={COLORS.outline} />
                        <Text style={styles.btnAcceptFullText}>Full ({currentPassengers}/{MAX_PASSENGERS})</Text>
                      </View>
                    ) : (
                      <TouchableOpacity
                        style={[styles.btnAccept, acceptingId === trip.id && styles.btnAcceptLoading]}
                        activeOpacity={0.9}
                        disabled={decliningId === trip.id || acceptingId === trip.id}
                        onPress={() => handleAccept(trip.id)}
                      >
                        {acceptingId === trip.id ? (
                          <>
                            <ActivityIndicator size="small" color="#ffffff" />
                            <Text style={styles.btnAcceptText}>Accepting...</Text>
                          </>
                        ) : (
                          <>
                            <Text style={styles.btnAcceptText}>Accept Ride</Text>
                            <MaterialIcons name="arrow-forward" size={18} color="#ffffff" />
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row', height: 60, paddingTop: 8, backgroundColor: COLORS.surface,
    borderBottomWidth: 1, borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile, position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
  },
  brandContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  logoBadge: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  brandTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  brandText: {
    fontSize: 22,
    fontWeight: '900',
    color: COLORS.primary,
    letterSpacing: -0.5,
  },
  brandTextAccent: {
    color: COLORS.secondary,
  },
  driverTag: {
    backgroundColor: 'rgba(0, 74, 198, 0.1)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(0, 74, 198, 0.2)',
  },
  driverTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: COLORS.primary,
    letterSpacing: 0.5,
  },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  statusPill: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
  },
  statusPillOnline: {
    backgroundColor: 'rgba(0, 108, 73, 0.12)',
  },
  statusPillOffline: {
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  statusDot: {
    width: 8, height: 8, borderRadius: 4,
  },
  statusPillText: {
    ...TYPOGRAPHY.caption, fontSize: 10, fontWeight: '900', letterSpacing: 0.5,
  },
  avatarBtn: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.outlineVariant },
  avatar: { width: '100%', height: '100%' },
  scrollContent: { paddingTop: 76, paddingHorizontal: SPACING.marginMobile, paddingBottom: 100 },
  welcomeSection: { marginTop: SPACING.xs, marginBottom: SPACING.md },
  welcomeName: { ...TYPOGRAPHY.headlineLgMobile, color: COLORS.onSurface, fontWeight: '700' },
  welcomeSubtitle: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant, marginTop: 2 },
  statusTextBold: { fontWeight: '800' },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: COLORS.surface,
    borderRadius: 16,
    paddingVertical: SPACING.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    marginBottom: SPACING.md,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statCard: {
    alignItems: 'center',
    gap: 2,
    position: 'relative',
  },
  redMark: {
    position: 'absolute',
    top: -2,
    right: -8,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#ef4444',
    borderWidth: 1.5,
    borderColor: '#ffffff',
  },
  statNumber: {
    ...TYPOGRAPHY.button,
    fontWeight: '800',
    color: COLORS.onSurface,
    fontSize: 16,
  },
  statLabel: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
  },
  statDivider: {
    width: 1,
    height: 32,
    backgroundColor: COLORS.outlineVariant,
  },
  ongoingBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 16,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  ongoingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  pulseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#22c55e',
  },
  ongoingTitle: {
    ...TYPOGRAPHY.button,
    fontWeight: '700',
    color: '#ffffff',
  },
  ongoingSub: {
    ...TYPOGRAPHY.caption,
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 11,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
  },
  resumeBtnText: {
    ...TYPOGRAPHY.button,
    fontSize: 12,
    color: '#ffffff',
  },
  section: { marginTop: SPACING.xs },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.onSurface, fontWeight: '700' },
  seeAllText: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant },
  capacityHint: {
    ...TYPOGRAPHY.caption,
    color: COLORS.secondary,
    fontWeight: '700',
    marginTop: 2,
  },
  maxCapacityState: {
    backgroundColor: '#fef2f2',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#fecaca',
    padding: SPACING.lg,
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  maxCapacityIconBg: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#fee2e2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  maxCapacityTitle: {
    ...TYPOGRAPHY.button,
    fontSize: 16,
    fontWeight: '800',
    color: '#991b1b',
  },
  maxCapacityDesc: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: '#7f1d1d',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: SPACING.md,
  },
  emptySubText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.outline,
    textAlign: 'center',
    marginTop: 4,
  },
  emptyState: { alignItems: 'center', paddingVertical: 36, gap: 8 },
  emptyText: { ...TYPOGRAPHY.body, color: COLORS.outline },
  requestCard: {
    backgroundColor: '#ffffff', borderRadius: 16, padding: SPACING.md,
    borderWidth: 1, borderColor: COLORS.outlineVariant, marginBottom: SPACING.md,
  },
  requestHeader: { marginBottom: SPACING.md },
  passengerRow: { flexDirection: 'row', alignItems: 'center' },
  passengerAvatarBg: {
    width: 48, height: 48, borderRadius: 24, backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center', alignItems: 'center',
  },
  passengerDetails: { marginLeft: SPACING.md, flex: 1 },
  passengerName: { ...TYPOGRAPHY.sectionTitle, fontWeight: '700', color: COLORS.onSurface },
  passengerSubText: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant },
  tripLocations: { gap: SPACING.xs, marginBottom: SPACING.md },
  locationItem: { flexDirection: 'row', alignItems: 'flex-start', gap: SPACING.sm },
  locationTextWrapper: { flex: 1, borderBottomWidth: 1, borderBottomColor: 'rgba(195, 198, 215, 0.3)', paddingBottom: 6 },
  locationTitle: { fontSize: 9, fontWeight: '700', textTransform: 'uppercase', color: COLORS.outline, letterSpacing: 0.5 },
  locationAddress: { ...TYPOGRAPHY.body, fontSize: 14, fontWeight: '600', color: COLORS.onSurface, marginTop: 1 },
  tripMetaBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: SPACING.md,
  },
  tripMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  tripMetaBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  notesText: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, marginBottom: SPACING.md, fontStyle: 'italic' },
  requestActions: { flexDirection: 'row', gap: SPACING.md },
  btnDecline: {
    flex: 1, height: 50, borderWidth: 1, borderColor: COLORS.outlineVariant,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  btnDeclineText: { ...TYPOGRAPHY.button, color: COLORS.primary, fontSize: 15 },
  btnAcceptLoading: {
    opacity: 0.85,
  },
  btnAccept: {
    flex: 2, height: 50, backgroundColor: COLORS.primaryContainer, borderRadius: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  btnAcceptText: { ...TYPOGRAPHY.button, color: '#ffffff', fontSize: 15 },
  btnAcceptFull: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
  },
  btnAcceptFullText: { ...TYPOGRAPHY.button, color: COLORS.outline, fontSize: 15 },
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingBottom: 12,
  },
  navItem: {
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4,
    position: 'relative', minWidth: 64,
  },
  navPill: {
    position: 'absolute', top: 2,
    left: '50%', marginLeft: -20,
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: COLORS.primary,
  },
  navText: { ...TYPOGRAPHY.navLabel, color: COLORS.onSurfaceVariant, marginTop: 4 },
  navTextActive: { color: COLORS.primary, fontWeight: '700' },
});
