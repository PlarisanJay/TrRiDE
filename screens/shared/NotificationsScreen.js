import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../../data/notifications';

export default function NotificationsScreen({ userProfile, onBack, onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!userProfile?.id) return;
    setLoading(true);
    const data = await getNotifications(userProfile.id);
    setNotifications(data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [userProfile?.id]);

  const handlePress = async (notif) => {
    if (!notif.read_at) {
      await markNotificationRead(notif.id);
      load();
    }
    if (notif.data?.screen && onNavigate) {
      onNavigate(notif.data.screen, notif.data);
    }
  };

  const handleMarkAllRead = async () => {
    if (!userProfile?.id) return;
    await markAllNotificationsRead(userProfile.id);
    load();
  };

  const getIcon = (type) => {
    switch (type) {
      case 'warning':
        return 'warning';
      case 'ban':
      case 'suspend':
        return 'block';
      case 'announcement':
        return 'campaign';
      case 'report':
        return 'report';
      case 'trip':
      case 'trip_accepted':
      case 'ride_accepted':
        return 'directions-car';
      case 'message':
        return 'chat';
      default:
        return 'notifications';
    }
  };

  const getIconColor = (type) => {
    switch (type) {
      case 'ban':
        return COLORS.error;
      case 'warning':
        return COLORS.tertiary;
      case 'suspend':
        return COLORS.error;
      case 'announcement':
        return COLORS.primary;
      case 'trip':
      case 'trip_accepted':
      case 'ride_accepted':
        return COLORS.secondary;
      case 'message':
        return COLORS.primary;
      default:
        return COLORS.primary;
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Notifications</Text>
        <TouchableOpacity onPress={handleMarkAllRead} style={styles.markAllBtn}>
          <Text style={styles.markAllText}>Mark all read</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={COLORS.primary} />
        </View>
      ) : notifications.length === 0 ? (
        <View style={styles.center}>
          <MaterialIcons name="notifications-none" size={64} color={COLORS.outlineVariant} />
          <Text style={styles.emptyTitle}>No notifications</Text>
          <Text style={styles.emptySubtitle}>You're all caught up</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
          {notifications.map((notif) => (
            <TouchableOpacity
              key={notif.id}
              style={[styles.card, SHADOWS.card, !notif.read_at && styles.cardUnread]}
              onPress={() => handlePress(notif)}
              activeOpacity={0.7}
            >
              <View style={[styles.iconCircle, { backgroundColor: getIconColor(notif.type) + '20' }]}>
                <MaterialIcons name={getIcon(notif.type)} size={22} color={getIconColor(notif.type)} />
              </View>
              <View style={styles.content}>
                <Text style={styles.title}>{notif.title}</Text>
                {notif.body ? <Text style={styles.body} numberOfLines={3}>{notif.body}</Text> : null}
                <Text style={styles.time}>{new Date(notif.created_at).toLocaleString()}</Text>
              </View>
              {!notif.read_at && <View style={styles.unreadDot} />}
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
  headerTitle: { ...TYPOGRAPHY.sectionTitle, color: COLORS.onSurface, fontWeight: '600', flex: 1, textAlign: 'center' },
  markAllBtn: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  markAllText: { ...TYPOGRAPHY.caption, color: COLORS.primary, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: SPACING.lg },
  emptyTitle: { ...TYPOGRAPHY.headlineMd, color: COLORS.onSurface, marginTop: SPACING.md },
  emptySubtitle: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant, marginTop: SPACING.xs },
  scrollContent: { padding: SPACING.md, gap: SPACING.sm },
  card: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.surface,
    borderRadius: ROUNDED.lg,
    padding: SPACING.md,
    gap: SPACING.sm,
  },
  cardUnread: { borderWidth: 1, borderColor: COLORS.primary + '40' },
  iconCircle: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center' },
  content: { flex: 1, gap: 4 },
  title: { ...TYPOGRAPHY.body, fontWeight: '600', color: COLORS.onSurface },
  body: { ...TYPOGRAPHY.body, color: COLORS.onSurfaceVariant },
  time: { ...TYPOGRAPHY.caption, color: COLORS.onSurfaceVariant },
  unreadDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginTop: 6 },
});
