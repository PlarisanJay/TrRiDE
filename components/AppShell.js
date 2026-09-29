import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import AppSidebar from './AppSidebar';
import ScreenFrame from './ScreenFrame';
import { CANVAS } from '../theme';

/**
 * The web app shell: optional full-bleed banner, optional 260px rail, and the
 * framed phone column in the remaining space.
 *
 * WHY THE RAIL SITS BESIDE THE FRAME, NOT INSTEAD OF IT
 * ---------------------------------------------------
 * ScreenFrame keeps every screen at its intended 480px. Dropping it to let
 * screens stretch full width would break the card grids and line lengths the
 * screens were designed around. Rail + centred column is the standard desktop
 * arrangement (Gmail, Slack, Linear), and it means no screen had to change to
 * get a desktop layout.
 *
 * WHY THIS TAKES `railActive` AS A PROP
 * ------------------------------------
 * It looks like this component should decide for itself by measuring the
 * window, but it must not. App.js needs the same answer in order to SUPPRESS
 * the phone BottomNavBar, and the only way to guarantee the two never disagree
 * is for one predicate to feed both. `isRailVisible` in lib/nav.js is that
 * predicate, and App.js is the one that measures. Consequently this component
 * contains no hooks and no breakpoints, which also makes it directly testable.
 *
 * BANNER PLACEMENT
 * ----------------
 * `banner` is rendered above the rail row, spanning the full viewport, which
 * is the shape the X and TikTok web prompts use. Putting it inside the framed
 * column would have made it 480px wide and tied it to a layout that is about to
 * be replaced on wider screens.
 *
 * MOBILE IS UNTOUCHED
 * -------------------
 * On native this returns `children` directly. No View, no rail, no banner is
 * inserted into the tree at all, so the phone renders exactly as it did before
 * this file existed.
 */

export default function AppShell({
  children,
  banner = null,
  railActive = false,
  frameVariant = 'phone',
  ...sidebarProps
}) {
  if (Platform.OS !== 'web') return children;

  return (
    <View style={styles.root}>
      {banner}
      <View style={styles.row}>
        {railActive && <AppSidebar {...sidebarProps} />}
        {/* Wrapped unconditionally so the content column keeps the same layout
            shape whether or not the rail is present. */}
        <View style={styles.content}>
          <ScreenFrame variant={frameVariant} railActive={railActive}>{children}</ScreenFrame>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: CANVAS.sunken,
  },
  row: {
    flex: 1,
    flexDirection: 'row',
  },
  content: {
    flex: 1,
  },
});
