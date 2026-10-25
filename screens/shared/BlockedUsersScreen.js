import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getBlockedUsers, unblockUser } from '../../data/blocks';
import { confirmDialog, alertDialog } from '../../lib/dialog';

export default function BlockedUsersScreen({ userProfile, onBack }) {
  const [blocked, setBlocked] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(null);

  const load = async () => {
    if (!userProfile?.id) return;
    setLoading(true);
    const data = await getBlockedUsers(userProfile.id);
    setBlocked(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [userProfile?.id]);

  const handleUnblock = async (blockedId) => {
    const confirmed = await confirmDialog({
      title: 'Unblock user',
      message: 'Are you sure you want to unblock this user?',
      confirmText: 'Unblock',
      cancelText: 'Cancel',
    });
    if (!confirmed) return;
    setBusy(blockedId);
    try {
      await unblockUser(userProfile.id, blockedId);
      await alertDialog({ title: 'Unblocked', message: 'User has been unblocked.' });
      await load();
    } catch (e) {
      await alertDialog({ title: 'Error', message: e.message || 'Failed to unblock' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Blocked Users</Text>
        <View style={styles.backBtn} />
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : blocked.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="block" size={64} color={COLORS.outlineVariant} />
          <Text style={styles.emptyTitle}>No blocked users</Text>
          <Text style={styles.emptySubtitle}>You haven't blocked anyone yet</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {blocked.map((item) => (
            <View key={item.blocked_id} style={[styles.card, SHADOWS.card]}>
              <View style={styles.cardLeft}>
                <View style={styles.avatar}>
                  <MaterialIcons name="person" size={24} color={COLORS.primary} />
                </View>
                <View style={styles.info}>
                  <Text style={styles.name}>{item.profile?.full_name || 'Unknown'}</Text>
                  <Text style={styles.role}>{item.profile?.role || ''}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item.blocked_id)}
                disabled={busy === item.blocked_id}
              >
                {busy === item.blocked_id ? (
                  <ActivityIndicator size="small" color={COLORS.primary} />
                ) : (
                  <Text style={styles.unblockText}>Unblock</Text>
                )}
              </TouchableOpacity>
            </View>
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
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.surface,
    borderRadius: ROUNDED.lg,
    padding: SPACING.md,
  },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: SPACING.sm, flex: 1 },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.surfaceContainerLow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  info: { flex: 1 },
  name: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.onSurface },
  role: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant, textTransform: 'capitalize' },
  unblockBtn: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.surfaceContainerHigh,
  },
  unblockText: { ...TYPOGRAPHY.button, color: COLORS.primary },
});
