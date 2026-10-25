import React, { useState, useEffect, useCallback } from 'react';
import UserAvatar from '../../components/UserAvatar';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED } from '../../theme';
import { getTripsByStudent } from '../../data/trips';

const UPCOMING_STATUSES = ['pending', 'accepted', 'in_progress'];
const COMPLETED_STATUSES = ['completed', 'cancelled'];

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: COLORS.primary, bg: 'rgba(0,74,198,0.08)' },
  accepted: { label: 'Accepted', color: COLORS.secondary, bg: 'rgba(0,108,73,0.08)' },
  in_progress: { label: 'In Progress', color: '#b45309', bg: 'rgba(217,119,6,0.1)' },
  completed: { label: 'Completed', color: '#006c49', bg: 'rgba(0,108,73,0.1)' },
  cancelled: { label: 'Cancelled', color: '#dc2626', bg: 'rgba(220,38,38,0.08)' },
};

export default function MyOrdersScreen({ userProfile, onGoBack, onNavigate, onViewTrip }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('upcoming');

  const fetchTrips = useCallback(async () => {
    try {
      const data = await getTripsByStudent(userProfile.id);
      setTrips(data || []);
    } catch (e) {
      console.error('Failed to load trips:', e);
    }
  }, [userProfile]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await fetchTrips();
      setLoading(false);
    })();
  }, [fetchTrips]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTrips();
    setRefreshing(false);
  }, [fetchTrips]);

  const filteredTrips = trips.filter((t) =>
    activeTab === 'upcoming'
      ? UPCOMING_STATUSES.includes(t.status)
      : COMPLETED_STATUSES.includes(t.status)
  );

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const hours = d.getHours();
    const minutes = d.getMinutes().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const h = hours % 12 || 12;
    return `${months[d.getMonth()]} ${d.getDate()} • ${h}:${minutes} ${ampm}`;
  };

  return (
    <View style={styles.container}>
      {/* Top Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>My Orders</Text>
        </View>
        <TouchableOpacity onPress={() => onNavigate('Profile')} activeOpacity={0.8}>
          <UserAvatar
            uri={userProfile?.avatar_url}
            name={userProfile?.full_name || 'S'}
            size={38}
          />
        </TouchableOpacity>
      </View>

      {/* Tabs (Clean Pill Toggle) */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          activeOpacity={0.7}
          onPress={() => setActiveTab('completed')}
        >
          <Text style={[styles.tabText, activeTab === 'completed' && styles.tabTextActive]}>Completed</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[COLORS.primary]} />}
        >
          {filteredTrips.length === 0 ? (
            <View style={styles.emptyState}>
              <MaterialIcons
                name={activeTab === 'upcoming' ? 'directions-bus' : 'history'}
                size={48}
                color={COLORS.outlineVariant}
              />
              <Text style={styles.emptyTitle}>
                {activeTab === 'upcoming' ? 'No Upcoming Rides' : 'No Completed Rides'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {activeTab === 'upcoming'
                  ? 'Your upcoming rides will appear here.'
                  : 'Your completed rides will appear here.'}
              </Text>
            </View>
          ) : (
            filteredTrips.map((trip) => {
              const statusCfg = STATUS_CONFIG[trip.status] || STATUS_CONFIG.pending;
              return (
                <TouchableOpacity
                  key={trip.id}
                  style={styles.orderCard}
                  activeOpacity={0.7}
                  onPress={() => onViewTrip(trip.id)}
                >
                  {/* Left: Icon Badge styled like message avatar */}
                  <View style={[styles.orderIconWrapper, { backgroundColor: statusCfg.bg }]}>
                    <MaterialIcons
                      name={
                        trip.status === 'completed'
                          ? 'task-alt'
                          : trip.status === 'cancelled'
                          ? 'cancel'
                          : trip.status === 'in_progress'
                          ? 'near-me'
                          : 'navigation'
                      }
                      size={22}
                      color={statusCfg.color}
                    />
                  </View>

                  {/* Middle: Details */}
                  <View style={styles.orderDetails}>
                    <View style={styles.orderTitleRow}>
                      <Text style={styles.orderTitle} numberOfLines={1}>
                        {trip.dest_text || 'Destination'}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>
                          {statusCfg.label}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.orderPickup} numberOfLines={1}>
                      From: {trip.pickup_text || 'Pickup point'}
                    </Text>

                    <View style={styles.orderMetaRow}>
                      <View style={styles.orderMetaItem}>
                        <MaterialIcons name="people-outline" size={13} color="#64748b" />
                        <Text style={styles.orderMetaText}>
                          {trip.passengers} pass{trip.passengers > 1 ? 'engers' : 'enger'}
                        </Text>
                      </View>
                      <Text style={styles.orderMetaDot}>•</Text>
                      <View style={styles.orderMetaItem}>
                        <MaterialIcons name="schedule" size={13} color="#64748b" />
                        <Text style={styles.orderMetaText}>{formatDate(trip.created_at)}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Right: Subtle, vertically centered chevron */}
                  <MaterialIcons name="chevron-right" size={20} color="#cbd5e1" style={styles.cardChevron} />
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>
      )}
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
  },
  header: {
    flexDirection: 'row',
    height: 60,
    paddingTop: 8,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(226, 232, 240, 0.7)',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#004ac6',
    letterSpacing: -0.3,
  },
  avatarBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    overflow: 'hidden',
  },
  avatar: {
    width: '100%',
    height: '100%',
  },
  avatarDefault: {
    borderRadius: 19,
    backgroundColor: COLORS.primaryContainer,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitials: {
    fontSize: 15,
    color: '#ffffff',
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: SPACING.marginMobile,
    marginTop: 14,
    marginBottom: 6,
    backgroundColor: '#f1f5f9',
    borderRadius: 12,
    padding: 4,
  },
  tab: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabActive: {
    backgroundColor: '#ffffff',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
  tabTextActive: {
    color: '#004ac6',
    fontWeight: '700',
  },
  listContent: {
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: 10,
    paddingBottom: 95,
  },
  orderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.7)',
  },
  orderIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  orderDetails: {
    flex: 1,
    justifyContent: 'center',
  },
  orderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 3,
  },
  orderTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
    flex: 1,
  },
  orderPickup: {
    fontSize: 13,
    fontWeight: '400',
    color: '#64748b',
    marginBottom: 5,
  },
  orderMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  orderMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  orderMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  orderMetaDot: {
    fontSize: 12,
    color: '#cbd5e1',
  },
  cardChevron: {
    marginLeft: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 70,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 17,
    color: '#475569',
    fontWeight: '700',
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#94a3b8',
    textAlign: 'center',
    paddingHorizontal: 30,
  },
});
