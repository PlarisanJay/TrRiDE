import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getMyReports } from '../../data/reports';

export default function MyReportsScreen({ userProfile, onBack, onOpenReport }) {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userProfile?.id) return;
    setLoading(true);
    const data = await getMyReports(userProfile.id);
    setReports(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [userProfile?.id]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'resolved':
        return COLORS.secondary;
      case 'dismissed':
        return COLORS.outline;
      case 'in_progress':
        return COLORS.primary;
      default:
        return COLORS.tertiary;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>My Reports</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="report" size={64} color={COLORS.outlineVariant} />
          <Text style={styles.emptyTitle}>No reports yet</Text>
          <Text style={styles.emptySubtitle}>Your reports will appear here</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {reports.map((report) => (
            <TouchableOpacity
              key={report.id}
              style={[styles.card, SHADOWS.card]}
              onPress={() => onOpenReport?.(report)}
              activeOpacity={0.7}
            >
              <View style={styles.cardHeader}>
                <Text style={styles.reason}>{report.reason}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(report.status) + '20' }]}>
                  <Text style={[styles.statusText, { color: getStatusColor(report.status) }]}>
                    {report.status.replace('_', ' ')}
                  </Text>
                </View>
              </View>
              {report.details ? <Text style={styles.details} numberOfLines={2}>{report.details}</Text> : null}
              <Text style={styles.date}>{new Date(report.created_at).toLocaleDateString()}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHigh,
  },
  backBtn: { width: 40, height: 40, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.onSurface, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  emptyTitle: { ...TYPOGRAPHY.headlineMd, color: COLORS.onSurface, marginTop: SPACING.md },
  emptySubtitle: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant, marginTop: SPACING.xs },
  scrollContent: { padding: SPACING.md, gap: SPACING.sm },
  card: { backgroundColor: COLORS.surface, borderRadius: ROUNDED.lg, padding: SPACING.md, gap: SPACING.sm },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  reason: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.onSurface, flex: 1 },
  statusBadge: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: ROUNDED.full },
  statusText: { ...TYPOGRAPHY.caption, fontWeight: '600', textTransform: 'capitalize' },
  details: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant },
  date: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant },
});
