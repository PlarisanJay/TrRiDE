import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView, ActivityIndicator, RefreshControl } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getTripsByStudent } from '../../data/trips';

const UPCOMING_STATUSES = ['pending', 'accepted', 'in_progress'];
const COMPLETED_STATUSES = ['completed', 'cancelled'];

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: COLORS.primary, bg: 'rgba(0,74,198,0.1)' },
  accepted: { label: 'Accepted', color: COLORS.secondary, bg: 'rgba(0,108,73,0.1)' },
  in_progress: { label: 'In Progress', color: COLORS.tertiary, bg: 'rgba(120,75,0,0.1)' },
  completed: { label: 'Completed', color: COLORS.secondary, bg: 'rgba(0,108,73,0.1)' },
  cancelled: { label: 'Cancelled', color: COLORS.error, bg: 'rgba(186,26,26,0.1)' },
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
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onGoBack}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Orders</Text>
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

      {/* Tabs */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'upcoming' && styles.tabActive]}
          activeOpacity={0.8}
          onPress={() => setActiveTab('upcoming')}
        >
          <Text style={[styles.tabText, activeTab === 'upcoming' && styles.tabTextActive]}>Upcoming</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'completed' && styles.tabActive]}
          activeOpacity={0.8}
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
                size={56}
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
                  style={[styles.tripCard, SHADOWS.diffusion]}
                  activeOpacity={0.8}
                  onPress={() => onViewTrip(trip.id)}
                >
                  <View style={styles.tripHeader}>
                    <View style={styles.tripRoute}>
                      <View style={styles.routeDots}>
                        <View style={[styles.routeDot, { backgroundColor: COLORS.primary }]} />
                        <View style={styles.routeLine} />
                        <View style={[styles.routeDot, { backgroundColor: COLORS.error, borderWidth: 0 }]} />
                      </View>
                      <View style={styles.routeTexts}>
                        <Text style={styles.routeText} numberOfLines={1}>{trip.pickup_text || 'Pickup'}</Text>
                        <Text style={styles.routeText} numberOfLines={1}>{trip.dest_text || 'Destination'}</Text>
                      </View>
                    </View>
                    <View style={[styles.statusBadge, { backgroundColor: statusCfg.bg }]}>
                      <Text style={[styles.statusBadgeText, { color: statusCfg.color }]}>{statusCfg.label}</Text>
                    </View>
                  </View>

                  <View style={styles.tripMeta}>
                    <View style={styles.tripMetaItem}>
                      <MaterialIcons name="people" size={14} color={COLORS.onSurfaceVariant} />
                      <Text style={styles.tripMetaText}>
                        {trip.passengers} passenger{trip.passengers > 1 ? 's' : ''}
                      </Text>
                    </View>
                    <View style={styles.tripMetaItem}>
                      <MaterialIcons name="schedule" size={14} color={COLORS.onSurfaceVariant} />
                      <Text style={styles.tripMetaText}>{formatDate(trip.created_at)}</Text>
                    </View>
                  </View>

                  <MaterialIcons name="chevron-right" size={20} color={COLORS.outlineVariant} style={styles.chevron} />
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
    backgroundColor: COLORS.background,
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
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: SPACING.marginMobile,
    paddingTop: SPACING.md,
    gap: SPACING.sm,
  },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: ROUNDED.md,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  tabActive: {
    backgroundColor: COLORS.primaryContainer,
    borderColor: COLORS.primaryContainer,
  },
  tabText: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurfaceVariant,
  },
  tabTextActive: {
    color: '#ffffff',
  },
  listContent: {
    padding: SPACING.marginMobile,
    gap: SPACING.sm,
    paddingBottom: 40,
  },
  tripCard: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    position: 'relative',
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  tripRoute: {
    flexDirection: 'row',
    flex: 1,
    gap: SPACING.sm,
    marginRight: SPACING.sm,
  },
  routeDots: {
    alignItems: 'center',
    paddingTop: 4,
  },
  routeDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  routeLine: {
    width: 1,
    height: 20,
    backgroundColor: COLORS.outlineVariant,
    marginVertical: 2,
  },
  routeTexts: {
    flex: 1,
    gap: 6,
  },
  routeText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.onSurface,
    fontWeight: '500',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
  tripMeta: {
    flexDirection: 'row',
    gap: SPACING.md,
    marginTop: SPACING.md,
    paddingTop: SPACING.sm,
    borderTopWidth: 1,
    borderTopColor: COLORS.outlineVariant,
  },
  tripMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  tripMetaText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  chevron: {
    position: 'absolute',
    right: SPACING.md,
    bottom: SPACING.md,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
    gap: SPACING.sm,
  },
  emptyTitle: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurfaceVariant,
    fontWeight: '600',
  },
  emptySubtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.outline,
    textAlign: 'center',
    paddingHorizontal: 40,
  },
});
