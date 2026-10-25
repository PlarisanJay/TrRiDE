import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { alertDialog } from '../../lib/dialog';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';
import { resolveInstallTarget, startInstall } from '../../lib/installApp';

export default function SettingsScreen({ userProfile, onBack, onNavigate }) {
  // These three are intentionally inert. There is no preference store wired up
  // (no AsyncStorage dependency, no theme provider), so the switches used to
  // flip local state and silently reset on every app restart while implying a
  // setting had been saved. They are shown disabled and labelled instead.
  const notificationsEnabled = true;
  const locationSharing = true;
  const darkMode = false;

  const handleClearCache = () => {
    // The app has no cache layer: trips, profiles and messages all come straight
    // from Supabase, and the only on-disk state is the driver's active-trip
    // record (cleared automatically on logout / trip completion).
    alertDialog({
      title: 'Nothing to clear',
      message:
        'TriRide has no offline cache. Your trips and messages load fresh from the server each time, so there is nothing stored on this device to remove.',
    });
  };

  // The install banner is dismissible, so it cannot be the only place the
  // option exists. This row is the permanent one. It is omitted entirely on
  // native (you are already in the app) and on iOS (no APK can run there), so
  // neither platform grows a dead row.
  const install = resolveInstallTarget();

  const handleInstall = () => {
    if (!install.canInstall) {
      alertDialog({
        title: 'Installer not configured',
        message:
          'The download link has not been set yet. Set EXPO_PUBLIC_APK_URL in .env to the published APK URL, then restart the web bundler.',
      });
      return;
    }
    startInstall(install.url);
  };

  const installSections =
    install.kind === 'apk' || install.kind === 'unconfigured'
      ? [
          {
            title: 'App',
            items: [
              {
                id: 'install',
                label: 'Install TriRide app',
                note: install.canInstall
                  ? 'Full screen on your phone. You will sign in once on the device.'
                  : 'Download link not configured yet',
                icon: 'download',
                type: 'action',
                onPress: handleInstall,
              },
            ],
          },
        ]
      : [];

  const settingSections = [
    // First, not last: the banner that points here is dismissible, so this row
    // is the only durable way back to the installer.
    ...installSections,
    {
      title: 'Notifications',
      items: [
        {
          id: 'push',
          label: 'Push Notifications',
          note: 'Always on â€” not configurable yet',
          icon: 'notifications',
          type: 'toggle',
          value: notificationsEnabled,
          onToggle: () => {},
        },
      ],
    },
    {
      title: 'Privacy',
      items: [
        {
          id: 'location',
          label: 'Share Location',
          note: 'Required for live driver tracking',
          icon: 'location-on',
          type: 'toggle',
          value: locationSharing,
          onToggle: () => {},
        },
      ],
    },
    // Removed Appearance/Dark Mode section
    {
      title: 'Safety & Reports',
      items: [
        {
          id: 'blocked',
          label: 'Blocked Users',
          note: 'Manage users you blocked',
          icon: 'block',
          type: 'action',
          onPress: () => onNavigate && onNavigate('BlockedUsers'),
        },
        {
          id: 'myreports',
          label: 'My Reports',
          note: 'View and reply to your reports',
          icon: 'report',
          type: 'action',
          onPress: () => onNavigate && onNavigate('MyReports'),
        },
      ],
    },
    // Removed Notification Center to fix duplicate key error
    {
      title: 'Storage',
      items: [
        {
          id: 'cache',
          label: 'About offline data',
          icon: 'info-outline',
          type: 'action',
          onPress: handleClearCache,
        },
      ],
    },
  ];

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} style={styles.backBtn}>
          <MaterialIcons name="arrow-back" size={24} color={COLORS.onSurface} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {settingSections.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionTitle}>{section.title}</Text>
            <View style={[styles.sectionCard, SHADOWS.card]}>
              {section.items.map((item, idx) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.settingRow,
                    idx < section.items.length - 1 && styles.settingRowBorder,
                  ]}
                  activeOpacity={item.type === 'toggle' ? 1 : 0.7}
                  onPress={item.type === 'action' ? item.onPress : undefined}
                  disabled={item.type === 'toggle'}
                >
                  <View style={styles.settingLeft}>
                    <MaterialIcons name={item.icon} size={20} color={COLORS.primary} />
                    <View style={styles.settingLabels}>
                      <Text style={styles.settingLabel}>{item.label}</Text>
                      {item.note ? <Text style={styles.settingNote}>{item.note}</Text> : null}
                    </View>
                  </View>
                  {item.type === 'toggle' ? (
                    <Switch
                      value={item.value}
                      onValueChange={item.onToggle}
                      disabled
                      trackColor={{ false: COLORS.surfaceContainerHigh, true: COLORS.primaryContainer }}
                      thumbColor={COLORS.onSurfaceVariant}
                    />
                  ) : (
                    <MaterialIcons name="chevron-right" size={20} color={COLORS.onSurfaceVariant} />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.version}>TriRide v1.0.0</Text>
      </ScrollView>
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
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHigh,
  },
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    // TYPOGRAPHY.titleLarge did not exist, so this spread was undefined and
    // the title fell back to the platform default. sectionTitle is the token
    // the other screen headers (Profile, AdminDashboard) actually use.
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  scrollContent: {
    padding: SPACING.md,
    paddingBottom: 100,
  },
  section: {
    marginBottom: SPACING.lg,
  },
  sectionTitle: {
    // was TYPOGRAPHY.bodySmall (undefined)
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: SPACING.sm,
    fontWeight: '600',
  },
  sectionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: ROUNDED.lg,
    overflow: 'hidden',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.md,
  },
  settingRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.surfaceContainerHigh,
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    flexShrink: 1,
  },
  settingLabels: {
    flexShrink: 1,
  },
  settingNote: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    marginTop: 2,
  },
  settingLabel: {
    // was TYPOGRAPHY.bodyLarge (undefined)
    ...TYPOGRAPHY.body,
    color: COLORS.onSurface,
  },
  version: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    marginTop: SPACING.xl,
  },
});
