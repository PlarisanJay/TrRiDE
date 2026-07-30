import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, Animated, ActivityIndicator, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { TOLEDO_CITY } from '../../config/mapConfig';
import MapPreview from '../../components/MapPreview';
import { getPendingTrips, acceptTrip, declineTrip, subscribeToPendingTrips } from '../../data/trips';
import { getProfileById } from '../../data/auth';

export default function DriverDashboardScreen({ userProfile, onAcceptRide, onNavigate }) {
  const [isOnline, setIsOnline] = useState(true);
  const [pendingTrips, setPendingTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(true);
  const [tripStudents, setTripStudents] = useState({});
  const toggleAlign = useRef(new Animated.Value(isOnline ? 1 : 0)).current;

  const handleToggle = () => {
    const nextState = !isOnline;
    setIsOnline(nextState);
    Animated.timing(toggleAlign, {
      toValue: nextState ? 1 : 0,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  useEffect(() => {
    loadPendingTrips();
    const unsub = subscribeToPendingTrips(async (newTrip) => {
      setPendingTrips((prev) => [newTrip, ...prev]);
      fetchStudentForTrip(newTrip);
    });
    return () => { if (unsub) unsub(); };
  }, []);

  const loadPendingTrips = async () => {
    setLoadingTrips(true);
    try {
      const trips = await getPendingTrips();
      setPendingTrips(trips);
      trips.forEach(fetchStudentForTrip);
    } catch (e) { console.log('loadPendingTrips error:', e?.message); }
    setLoadingTrips(false);
  };

  const fetchStudentForTrip = async (trip) => {
    if (tripStudents[trip.student_id]) return;
    try {
      const student = await getProfileById(trip.student_id);
      setTripStudents((prev) => ({ ...prev, [trip.student_id]: student }));
    } catch (e) {}
  };

  const handleAccept = async (tripId) => {
    try {
      await acceptTrip(tripId, userProfile.id);
      setPendingTrips((prev) => prev.filter((t) => t.id !== tripId));
      onAcceptRide(tripId);
    } catch (e) {
      console.log('handleAccept error:', e?.message);
      Alert.alert('Error', 'Could not accept this trip. Please try again.');
    }
  };

  const handleDecline = async (tripId) => {
    try {
      await declineTrip(tripId);
      setPendingTrips((prev) => prev.filter((t) => t.id !== tripId));
    } catch (e) {
      console.log('handleDecline error:', e?.message);
      Alert.alert('Error', 'Could not decline this trip. Please try again.');
    }
  };

  const handleMessage = () => onNavigate('Messages');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn}>
            <MaterialIcons name="menu" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>TriRide</Text>
        </View>
        <View style={styles.headerRight}>
          <TouchableOpacity
            style={[styles.toggleBg, { backgroundColor: isOnline ? COLORS.secondary : COLORS.outlineVariant }]}
            activeOpacity={0.8}
            onPress={handleToggle}
          >
            <Text style={[styles.toggleText, isOnline ? styles.textLeft : styles.textRight]}>
              {isOnline ? 'ON' : 'OFF'}
            </Text>
            <Animated.View
              style={[styles.toggleHandle, { transform: [{ translateX: toggleAlign.interpolate({ inputRange: [0, 1], outputRange: [2, 38] }) }] }]}
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.avatarBtn} onPress={() => onNavigate('Profile')}>
            <Image
              source={{ uri: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAapAdirmGWcA1uH7PBnniOX5oiEplp-s7txc7CdTH8SAAW1vPtCpPdVrbLZHkcuGhvybf9x4lYIZ5BjWb0-uvlTrKHTVravtHc597m2pG6UBA9pd_hMrARmpy6ZenQQA-TmZkkz1k4oTJiRHPWgYgZbThFM0KWArTpE-xC-6t1B-tvsE8tp0c0zTqCLoCy2Tr4qyfkumRPsNSYTzdCwoy0YHii-24HoqR08mqcwbhRoKzbmMQvexxZGPvNj0IFPJQ8cZmrmetT8SQ' }}
              style={styles.avatar}
            />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeName}>Hello, {userProfile?.full_name?.split(' ')[0] || 'Driver'}!</Text>
          <Text style={styles.welcomeSubtitle}>
            You're currently{' '}
            <Text style={[styles.statusTextBold, { color: isOnline ? COLORS.secondary : COLORS.outline }]}>
              {isOnline ? 'Online' : 'Offline'}
            </Text>{' '}
            and {isOnline ? 'ready for rides' : 'resting'}.
          </Text>
        </View>

        <View style={[styles.mapContainer, SHADOWS.diffusion]}>
          <MapPreview region={{ ...TOLEDO_CITY, latitudeDelta: 0.03, longitudeDelta: 0.03 }} />
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Incoming Requests</Text>
            <Text style={styles.seeAllText}>{pendingTrips.length} pending</Text>
          </View>

          {loadingTrips ? (
            <ActivityIndicator size="small" color={COLORS.primary} style={{ marginTop: 20 }} />
          ) : pendingTrips.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons name="directions-bike" size={48} color={COLORS.outlineVariant} />
              <Text style={styles.emptyText}>No pending requests</Text>
            </View>
          ) : (
            pendingTrips.map((trip) => {
              const student = tripStudents[trip.student_id];
              return (
                <View key={trip.id} style={[styles.requestCard, SHADOWS.diffusion]}>
                  <View style={styles.requestHeader}>
                    <View style={styles.passengerRow}>
                      <View style={styles.passengerAvatarBg}>
                        <MaterialIcons name="person" size={24} color={COLORS.primary} />
                      </View>
                      <View style={styles.passengerDetails}>
                        <Text style={styles.passengerName}>{student?.full_name || 'Loading...'}</Text>
                        <Text style={styles.passengerSubText}>{trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}</Text>
                      </View>
                    </View>
                  </View>

                  <View style={styles.tripLocations}>
                    <View style={styles.locationItem}>
                      <MaterialIcons name="trip-origin" size={16} color={COLORS.secondary} />
                      <View style={styles.locationTextWrapper}>
                        <Text style={styles.locationTitle}>Pickup</Text>
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

                  {trip.notes ? (
                    <Text style={styles.notesText}>Note: {trip.notes}</Text>
                  ) : null}

                  <View style={styles.requestActions}>
                    <TouchableOpacity style={styles.btnDecline} activeOpacity={0.8} onPress={() => handleDecline(trip.id)}>
                      <Text style={styles.btnDeclineText}>Decline</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.btnAccept} activeOpacity={0.9} onPress={() => handleAccept(trip.id)}>
                      <Text style={styles.btnAcceptText}>Accept Ride</Text>
                      <MaterialIcons name="arrow-forward" size={16} color="#ffffff" />
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      <View style={styles.bottomNav}>
        <TouchableOpacity style={styles.navItem} onPress={() => onNavigate('Home')}>
          <MaterialIcons name="home" size={24} color={COLORS.primary} />
          <Text style={[styles.navText, styles.navTextActive]}>Home</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={handleMessage}>
          <MaterialIcons name="chat" size={24} color={COLORS.onSurfaceVariant} />
          <Text style={styles.navText}>Messages</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.navItem} onPress={() => onNavigate('Profile')}>
          <MaterialIcons name="person" size={24} color={COLORS.onSurfaceVariant} />
          <Text style={styles.navText}>Profile</Text>
        </TouchableOpacity>
      </View>
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
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm },
  headerIconBtn: { padding: SPACING.xs },
  headerTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.primary, fontWeight: '800' },
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: SPACING.md },
  toggleBg: {
    width: 64, height: 28, borderRadius: 14, flexDirection: 'row',
    alignItems: 'center', position: 'relative', paddingHorizontal: 6,
  },
  toggleHandle: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    backgroundColor: '#ffffff', shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2, shadowRadius: 2, elevation: 2, top: 2,
  },
  toggleText: { ...TYPOGRAPHY.caption, fontSize: 9, fontWeight: '900', color: '#ffffff', position: 'absolute' },
  textLeft: { left: 10 }, textRight: { right: 10 },
  avatarBtn: { width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.outlineVariant },
  avatar: { width: '100%', height: '100%' },
  scrollContent: { paddingTop: 76, paddingHorizontal: SPACING.marginMobile, paddingBottom: 100 },
  welcomeSection: { marginTop: SPACING.md, marginBottom: SPACING.lg },
  welcomeName: { ...TYPOGRAPHY.headlineLgMobile, color: COLORS.onSurface, fontWeight: '700' },
  welcomeSubtitle: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant },
  statusTextBold: { fontWeight: '800' },
  mapContainer: {
    height: 200, borderRadius: 16, overflow: 'hidden', borderWidth: 1,
    borderColor: COLORS.outlineVariant, position: 'relative', marginBottom: SPACING.lg,
  },
  section: { marginTop: SPACING.md },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: SPACING.md },
  sectionTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.onSurface, fontWeight: '700' },
  seeAllText: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant },
  emptyState: { alignItems: 'center', paddingVertical: 40, gap: 8 },
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
  notesText: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, marginBottom: SPACING.md, fontStyle: 'italic' },
  requestActions: { flexDirection: 'row', gap: SPACING.md },
  btnDecline: {
    flex: 1, height: 48, borderWidth: 1, borderColor: COLORS.outlineVariant,
    borderRadius: 12, justifyContent: 'center', alignItems: 'center',
  },
  btnDeclineText: { ...TYPOGRAPHY.button, color: COLORS.primary },
  btnAccept: {
    flex: 2, height: 48, backgroundColor: COLORS.primaryContainer, borderRadius: 12,
    flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6,
  },
  btnAcceptText: { ...TYPOGRAPHY.button, color: '#ffffff' },
  bottomNav: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 75,
    backgroundColor: COLORS.surface, borderTopWidth: 1, borderTopColor: COLORS.outlineVariant,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.08,
    shadowRadius: 10, elevation: 10, paddingBottom: 15,
  },
  navItem: { alignItems: 'center', justifyContent: 'center', padding: 8 },
  navText: { ...TYPOGRAPHY.navLabel, color: COLORS.onSurfaceVariant, marginTop: 2 },
  navTextActive: { color: COLORS.primary, fontWeight: '700' },
});
