import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  ACCENT,
  BORDERS,
  CANVAS,
  ELEVATION,
  GRADIENTS,
  INK,
  ROUNDED,
  SPACING,
  TYPOGRAPHY,
} from '../theme';
import { displayName, roleLabel, tabsForRole } from '../lib/nav';

/**
 * Desktop navigation rail for wide web viewports.
 *
 * WHY A RAIL AND NOT THE PHONE TAB BAR
 * ------------------------------------
 * On a 1440px monitor a 76px bar pinned to the bottom of a 480px column
 * wastes the entire left side of the screen and reads as a phone screenshot
 * that happens to be big. Moving navigation to a 260px rail is the smallest
 * change that makes the web layout read as a desktop app, which is the point
 * of having a web view at all.
 *
 * THE SCREEN BODIES ARE STILL PHONE-SIZED
 * --------------------------------------
 * Only navigation changed. Each screen keeps its existing phone layout inside
 * the framed column, because re-laying-out 16 screens for wide viewports is a
 * separate piece of work with a much larger blast radius. The rail makes the
 * chrome different; the content stays correct because it was already correct.
 *
 * PARALLEL TO AdminDashboardScreen, NOT A REUSE
 * -------------------------------------------
 * The styling mirrors the admin rail at AdminDashboardScreen.js:41-53 and its
 * `styles.sidebar*` block, which is the established desktop idiom in this
 * project. The constants are duplicated rather than extracted: touching the
 * admin screen means touching the most security-sensitive screen in the app
 * for a purely visual gain.
 *
 * Replaces the centred "Book a ride" FAB
 * --------------------------------------
 * The phone bar gives that action a floating button, which has no meaning in a
 * vertical list. It is rendered here as a normal primary item above the tabs so
 * students keep the same single, findable entry point to booking.
 */

export const SIDEBAR_BREAKPOINT = 768;
export const SIDEBAR_WIDTH = 260;

export default function AppSidebar({
  userRole,
  userProfile,
  currentScreen,
  onNavigate,
  onBookRide,
  unreadMessagesCount = 0,
  onLogout,
}) {
  const isDriver = userRole === 'driver';
  const tabs = tabsForRole(userRole);
  // Same rule as BottomNavBar: the badge would be meaningless on the tab the
  // user is already looking at.
  const showBadge = unreadMessagesCount > 0 && currentScreen !== 'Messages';

  return (
    <View style={styles.sidebar}>
      <View style={styles.header}>
        <Text style={styles.logo}>TriRide</Text>
        <Text style={styles.role}>{roleLabel(userRole)}</Text>
      </View>

      <ScrollView
        style={styles.navScroll}
        contentContainerStyle={styles.nav}
        showsVerticalScrollIndicator={false}
      >
        {!isDriver && (
          <TouchableOpacity
            style={styles.cta}
            onPress={onBookRide}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel="Book a ride"
          >
            <LinearGradient {...GRADIENTS.brand} style={styles.ctaFill}>
              <MaterialIcons name="near-me" size={20} color="#ffffff" />
              <Text style={styles.ctaText}>Book a ride</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}

        {tabs.map((tab) => {
          const isActive = currentScreen === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              style={[styles.navItem, isActive && styles.navItemActive]}
              onPress={() => onNavigate(tab.key)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={tab.label}
            >
              <MaterialIcons
                name={tab.icon}
                size={20}
                color={isActive ? ACCENT.blueDeep : INK.subtle}
              />
              <Text style={[styles.navText, isActive && styles.navTextActive]}>
                {tab.label}
              </Text>
              {tab.key === 'Messages' && showBadge && (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>
                    {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      <View style={styles.footer}>
        <Text style={styles.footerName} numberOfLines={1}>
          {displayName(userProfile)}
        </Text>
        {onLogout && (
          <TouchableOpacity
            style={styles.logoutBtn}
            onPress={onLogout}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Log out"
          >
            <MaterialIcons name="logout" size={19} color={ACCENT.red} />
            <Text style={styles.logoutText}>Log Out</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: SIDEBAR_WIDTH,
    backgroundColor: CANVAS.base,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: BORDERS.strong.borderColor,
    paddingTop: SPACING.lg,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    marginBottom: SPACING.lg,
  },
  logo: {
    ...TYPOGRAPHY.headlineMd,
    color: ACCENT.blueDeep,
    fontWeight: '800',
  },
  role: {
    ...TYPOGRAPHY.caption,
    color: INK.subtle,
    marginTop: 2,
  },

  navScroll: {
    flex: 1,
  },
  nav: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.xs,
    paddingBottom: SPACING.lg,
  },

  cta: {
    borderRadius: ROUNDED.md,
    marginBottom: SPACING.md,
    ...ELEVATION.glow,
  },
  ctaFill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 12,
    paddingHorizontal: SPACING.md,
    borderRadius: ROUNDED.md,
  },
  ctaText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },

  navItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 11,
    borderRadius: ROUNDED.md,
  },
  navItemActive: {
    backgroundColor: ACCENT.blueWash,
    ...BORDERS.accent,
  },
  navText: {
    ...TYPOGRAPHY.body,
    color: INK.slate,
    flex: 1,
  },
  navTextActive: {
    color: ACCENT.blueDeep,
    fontWeight: '700',
  },
  badge: {
    backgroundColor: ACCENT.red,
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: ROUNDED.full,
    alignItems: 'center',
  },
  badgeText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '800',
    lineHeight: 15,
    color: '#ffffff',
  },

  footer: {
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.lg,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: BORDERS.strong.borderColor,
  },
  footerName: {
    ...TYPOGRAPHY.caption,
    color: INK.slate,
    fontWeight: '600',
    paddingHorizontal: SPACING.md,
    marginBottom: SPACING.xs,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: 10,
    borderRadius: ROUNDED.md,
  },
  logoutText: {
    ...TYPOGRAPHY.body,
    color: ACCENT.red,
    fontWeight: '600',
  },
});
