import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, SHADOWS } from '../../theme';
import { getTripsByDriver } from '../../data/trips';

const formatTripDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' }) +
    ' • ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

export default function DriverCompletedRidesScreen({ userProfile, onBack }) {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const all = await getTripsByDriver(userProfile?.id);
        const completed = (all || []).filter((t) => t.status === 'completed');
        if (mounted) setTrips(completed);
      } catch (e) {
        console.warn('Could not load completed rides:', e.message);
      }
      if (mounted) setLoading(false);
    })();
    return () => { mounted = false; };
  }, [userProfile?.id]);

  const renderTrip = ({ item }) => {
    const expanded = expandedId === item.id;
    return (
      <View style={[styles.tripCard, SHADOWS.card]}>
        <TouchableOpacity style={styles.tripHeader} activeOpacity={0.8} onPress={() => setExpandedId((prev) => (prev === item.id ? null : item.id))}>
          <View style={styles.statusBadge}>
            <MaterialIcons name="check-circle" size={16} color="#16a34a" />
            <Text style={styles.statusText}>Completed</Text>
          </View>
          <View style={styles.tripSummary}>
            <Text style={styles.routeText} numberOfLines={2}>
              <Text style={styles.routePickup}>{item.pickup_text || 'Pickup'}</Text>
              {'  →  '}
              <Text style={styles.routeDest}>{item.dest_text || 'Destination'}</Text>
            </Text>
            <Text style={styles.tripMeta}>{formatTripDate(item.created_at)}</Text>
          </View>
          <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>

        {expanded && (
          <View style={styles.tripDetails}>
            <View style={styles.detailRow}>
              <MaterialIcons name="group" size={16} color={COLORS.onSurfaceVariant} />
              <Text style={styles.detailText}>
                {item.passengers} passenger{item.passengers > 1 ? 's' : ''}
              </Text>
            </View>
            {item.notes ? (
              <View style={styles.detailRow}>
                <MaterialIcons name="note" size={16} color={COLORS.onSurfaceVariant} />
                <Text style={styles.detailText}>{item.notes}</Text>
              </View>
            ) : null}
          </View>
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
          <Text style={styles.headerTitle}>Completed Rides</Text>
        </View>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={COLORS.primary} />
          <Text style={styles.loadingText}>Loading your completed rides...</Text>
        </View>
      ) : trips.length === 0 ? (
        <View style={styles.centered}>
          <MaterialIcons name="check-circle" size={48} color={COLORS.outlineVariant} />
          <Text style={styles.loadingText}>No completed rides yet</Text>
        </View>
      ) : (
        <FlatList
          data={trips}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={renderTrip}
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
  tripCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    padding: SPACING.md,
    marginBottom: SPACING.md,
  },
  tripHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: 'rgba(22, 163, 74, 0.12)',
  },
  statusText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    color: '#16a34a',
  },
  tripSummary: {
    flex: 1,
    gap: 2,
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
  tripDetails: {
    marginTop: SPACING.md,
    paddingTop: SPACING.md,
    borderTopWidth: 1,
    borderTopColor: 'rgba(226, 232, 240, 0.8)',
    gap: SPACING.sm,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.sm,
  },
  detailText: {
    ...TYPOGRAPHY.body,
    fontSize: 14,
    color: COLORS.onSurfaceVariant,
    flex: 1,
  },
});