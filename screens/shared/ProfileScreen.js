import React from 'react';
import { View, Text, StyleSheet, Image, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';

export default function ProfileScreen({ userRole, userProfile, onLogout, onBack }) {
  const isStudent = userRole === 'student';

  const name = userProfile?.full_name || (isStudent ? 'Student User' : 'Driver User');
  const roleTag = isStudent ? 'Student' : 'Driver';
  const email = userProfile?.email || '';
  const phone = userProfile?.phone || 'N/A';

  const stat1Label = isStudent ? 'Rides' : 'Trips';
  const stat1Value = isStudent ? '42' : '14';
  const stat2Label = 'Rating';
  const stat2Value = isStudent ? '4.9 ★' : '4.92 ★';

  // Use profile photo from Supabase if available, otherwise use initials icon
  const photo = null;

  const menuItems = [
    {
      id: 'edit',
      title: 'Edit Profile',
      subtitle: 'Name, email, and phone number',
      icon: 'person',
      iconColor: COLORS.primary,
      iconBg: COLORS.primaryFixed,
    },
    {
      id: 'history',
      title: isStudent ? 'Ride History' : 'Trip History',
      subtitle: 'Past trips and receipts',
      icon: 'history',
      iconColor: COLORS.tertiary,
      iconBg: COLORS.tertiaryFixed,
    },
    {
      id: 'settings',
      title: 'Settings',
      subtitle: 'Privacy and notifications',
      icon: 'settings',
      iconColor: COLORS.onSurfaceVariant,
      iconBg: COLORS.surfaceContainerHigh,
    },
  ];

  return (
    <View style={styles.container}>
      {/* Top Nav Bar */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <TouchableOpacity style={styles.headerIconBtn} onPress={onBack}>
            <MaterialIcons name="arrow-back" size={24} color={COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Profile Card Info */}
        <View style={[styles.profileCard, SHADOWS.diffusion]}>
          <View style={styles.avatarContainer}>
            {photo ? (
              <Image source={{ uri: photo }} style={styles.avatar} />
            ) : (
              <View style={[styles.avatar, { backgroundColor: COLORS.primaryContainer, justifyContent: 'center', alignItems: 'center' }]}>
                <MaterialIcons name={isStudent ? 'school' : 'directions-car'} size={32} color="#ffffff" />
              </View>
            )}
            <TouchableOpacity style={styles.editBtn}>
              <MaterialIcons name="edit" size={16} color="#ffffff" />
            </TouchableOpacity>
          </View>

          <Text style={styles.name}>{name}</Text>
          <View style={styles.roleTagContainer}>
            <Text style={styles.roleTagText}>{roleTag}</Text>
          </View>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <Text style={styles.statBoxLabel}>{stat1Label}</Text>
              <Text style={styles.statBoxValue}>{stat1Value}</Text>
            </View>
            <View style={styles.statBox}>
              <Text style={styles.statBoxLabel}>{stat2Label}</Text>
              <Text style={styles.statBoxValue}>{stat2Value}</Text>
            </View>
          </View>
        </View>

        {/* Menu Options */}
        <View style={styles.menuCard}>
          {menuItems.map((item, idx) => (
            <TouchableOpacity
              key={item.id}
              style={[
                styles.menuItem,
                idx < menuItems.length - 1 && styles.menuItemBorder,
              ]}
              activeOpacity={0.7}
            >
              <View style={styles.menuItemLeft}>
                <View style={[styles.menuIconBg, { backgroundColor: item.iconBg }]}>
                  <MaterialIcons name={item.icon} size={20} color={item.iconColor} />
                </View>
                <View>
                  <Text style={styles.menuTitle}>{item.title}</Text>
                  <Text style={styles.menuSubtitle}>{item.subtitle}</Text>
                </View>
              </View>
              <MaterialIcons name="chevron-right" size={24} color={COLORS.outline} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Logout Button */}
        <TouchableOpacity style={styles.btnLogout} activeOpacity={0.8} onPress={onLogout}>
          <MaterialIcons name="logout" size={20} color="#ffffff" style={styles.logoutIcon} />
          <Text style={styles.btnLogoutText}>Logout</Text>
        </TouchableOpacity>
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
    height: 60,
    paddingTop: 8,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.outlineVariant,
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.marginMobile,
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
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
  scrollContent: {
    paddingTop: 76,
    paddingHorizontal: SPACING.marginMobile,
    paddingBottom: 40,
    maxWidth: 600,
    alignSelf: 'center',
    width: '100%',
  },
  profileCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    padding: SPACING.lg,
    alignItems: 'center',
    marginBottom: SPACING.lg,
    marginTop: SPACING.md,
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: SPACING.md,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 48,
    borderWidth: 4,
    borderColor: COLORS.primaryFixed,
  },
  editBtn: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    backgroundColor: COLORS.primary,
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  name: {
    ...TYPOGRAPHY.headlineMd,
    color: COLORS.onSurface,
    fontWeight: '700',
    textAlign: 'center',
  },
  roleTagContainer: {
    backgroundColor: COLORS.primaryFixed,
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 20,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
  },
  roleTagText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onPrimaryFixedVariant || COLORS.primary,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    gap: SPACING.md,
    width: '100%',
    justifyContent: 'center',
  },
  statBox: {
    backgroundColor: COLORS.surfaceContainerHigh,
    borderRadius: ROUNDED.default,
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.lg,
    alignItems: 'center',
    minWidth: 100,
  },
  statBoxLabel: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    fontWeight: '500',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  statBoxValue: {
    ...TYPOGRAPHY.sectionTitle,
    color: COLORS.onSurface,
    fontWeight: '700',
    marginTop: 2,
  },
  menuCard: {
    backgroundColor: COLORS.surfaceContainerLowest,
    borderWidth: 1,
    borderColor: COLORS.outlineVariant,
    borderRadius: ROUNDED.md,
    overflow: 'hidden',
    marginBottom: SPACING.lg,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: SPACING.md,
  },
  menuItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(195, 198, 215, 0.3)',
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  menuIconBg: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuTitle: {
    ...TYPOGRAPHY.button,
    color: COLORS.onSurface,
    fontWeight: '600',
  },
  menuSubtitle: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
  },
  btnLogout: {
    height: 56,
    borderRadius: ROUNDED.md,
    backgroundColor: COLORS.error,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: COLORS.error,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  logoutIcon: {
    marginRight: 6,
  },
  btnLogoutText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
});
