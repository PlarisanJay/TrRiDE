import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, SectionList } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, SHADOWS } from '../../theme';
import { getTripsByDriver } from '../../data/trips';
import { getCancelledTrips } from '../../data/cancelledTripsStore';

const formatTripDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' • ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function DriverTripsScreen({ userProfile, activeTripId, onBack, onResumeTrip }) {
  const [ongoing, setOngoing] = useState([]);
  const [cancelled, setCancelled] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await getTripsByDriver(userProfile?.id);
        if (mounted) {
          setOngoing((all || []).filter((t) => t.status === 'accepted' || t.status === 'in_progress'));
        }
      } catch (e) {
        console.warn('Could not load ongoing trips:', e.message);
      }
      try {
        const cancelledTrips = await getCancelledTrips();
        if (mounted) setCancelled(cancelledTrips);
      } catch (e) {
        console.warn('Could not load cancelled trips:', e.message);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [userProfile?.id]);

  const sections = [
    { title: 'Ongoing', data: ongoing, key: 'ongoing' },
    { title: 'Cancelled', data: cancelled, key: 'cancelled' },
  ];

  const renderItem = ({ item, section }) => {
    const isOngoing = section.key === 'ongoing';
    const isCurrent = item.id === activeTripId;
    return (
      <View style={[styles.tripCard, SHADOWS.card]}>
        <View style={styles.tripRow}>
          <View style={[styles.statusBadge, isOngoing ? styles.badgeOngoing : styles.badgeCancelled]}>
            <MaterialIcons
              name={isOngoing ? (item.status === 'in_progress' ? 'directions-car' : 'schedule') : 'cancel'}
              size={16}
              color={isOngoing ? COLORS.primary : COLORS.outline}
            />
            <Text style={[styles.statusText, { color: isOngoing ? COLORS.primary : COLORS.outline }]}>
              {isOngoing ? (item.status === 'in_progress' ? 'In Progress' : 'Accepted') : 'Cancelled'}
            </Text>
          </View>
        </View>

        <Text style={styles.routeText} numberOfLines={2}>
          <Text style={styles.routePickup}>{item.pickup_text || 'Pickup'}</Text>
          {'  →  '}
          <Text style={styles.routeDest}>{item.dest_text || 'Destination'}</Text>
        </Text>
        <Text style={styles.tripMeta}>
          {formatTripDate(item.created_at)} • {item.passengers} passenger{item.passengers > 1 ? 's' : ''}
        </Text>

        {isOngoing && (
          <TouchableOpacity
            style={styles.resumeBtn}
            activeOpacity={0.9}
            onPress={() => onResumeTrip(item.id)}
          >
            <MaterialIcons name={isCurrent ? 'directions-car' : 'play-arrow'} size={18} color="#ffffff" />
            <Text style={styles.resumeBtnText}>
              {isCurrent ? 'View Ongoing Trip' : 'Resume Trip'}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onBack}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>My Trips</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your trips...</Text>
        </View>
      ) : ongoing.length === 0 && cancelled.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="directions-car" size={48} color={COLORS.outlineVariant} />
          <Text style={styles.loadingText}>No ongoing or cancelled trips yet</Text>
        </View>
      ) : (
        <SectionList
          sections={sections.filter((s) => s.data.length > 0)}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHeader}>{section.title}</Text>
          )}
          ListEmptyComponent={null}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 64,
    paddingTop: 4,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flex: 1,
  },
  headerIconBtn: {
    padding: SPACING.xs,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: COLORS.onSurface,
    letterSpacing: -0.5,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: SPACING.marginMobile,
  },
  loadingText: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    marginTop: 8,
  },
  listContent: {
    padding: SPACING.marginMobile,
    paddingBottom: 100,
  },
  sectionHeader: {
    ...TYPOGRAPHY.sectionTitle,
    fontWeight: '700',
    color: COLORS.onSurface,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  tripCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: SPACING.md,
    marginBottom: SPACING.md,
    gap: SPACING.xs,
  },
  tripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.xs,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  badgeOngoing: {
    backgroundColor: 'rgba(0, 74, 198, 0.12)',
  },
  badgeCancelled: {
    backgroundColor: 'rgba(115, 118, 134, 0.12)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  routeText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.onSurface,
  },
  routePickup: {
    color: COLORS.secondary,
  },
  routeDest: {
    color: COLORS.primary,
  },
  tripMeta: {
    ...TYPOGRAPHY.caption,
    fontSize: 12,
    color: COLORS.onSurfaceVariant,
  },
  resumeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: SPACING.sm,
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 12,
  },
  resumeBtnText: {
    ...TYPOGRAPHY.button,
    fontSize: 15,
    color: '#ffffff',
  },
});