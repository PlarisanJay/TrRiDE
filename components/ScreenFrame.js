import React from 'react';
import { Platform, StyleSheet, useWindowDimensions, View } from 'react-native';
import { BORDERS, CANVAS, ELEVATION } from '../theme';

/**
 * Centres the app in a phone-width column on wide browser viewports.
 *
 * WHY
 * ---
 * The screens are all designed for a phone. Rendering one across a 2560px
 * monitor gives you a full-width bottom tab bar with three tabs marooned at
 * the far left and a card grid stretched to unusable line lengths. A centred
 * 480px column keeps every screen's existing layout correct, and leaves the
 * surrounding area as calm page background instead of stretched content.
 *
 * This is a layout-only wrapper. It deliberately adds no navigation, no side
 * rail and no screen awareness, so no individual screen has to change.
 *
 * WHAT IT DOES NOT COVER
 * ----------------------
 * AdminDashboardScreen is excluded by the caller — it already renders its own
 * persistent sidebar at `AdminDashboardScreen.js:41-53` and is a genuinely
 * wide layout, so framing it at 480px would break it.
 *
 * MOBILE IS UNTOUCHED
 * -------------------
 * On native this returns `children` directly — no extra View is inserted into
 * the tree at all, so there is no new layout node on the phone.
 */

export const FRAME_BREAKPOINT = 520;
export const FRAME_MAX_WIDTH = 480;
export const APP_MAX_WIDTH = 1120;

// Split out so useWindowDimensions is only ever called from a component that
// unconditionally calls it. An early `return children` above the hook would
// make the hook order depend on Platform.OS.
function WebFrame({ children, variant = 'phone', railActive = false }) {
  const { width } = useWindowDimensions();

  // Narrow browser window / mobile browser: render exactly as before, with no
  // wrapper view, so the phone layout is untouched.
  if (width <= FRAME_BREAKPOINT) return children;

  if (variant === 'map') {
    return <View style={styles.mapStage}>{children}</View>;
  }

  if (variant === 'app') {
    return (
      <View style={[styles.appStage, railActive ? styles.appStageRail : styles.appStageCentered]}>
        <View style={[styles.appFrame, !railActive && styles.appFrameCapped]}>{children}</View>
      </View>
    );
  }

  return (
    <View style={styles.stage}>
      <View style={styles.frame}>{children}</View>
    </View>
  );
}

export default function ScreenFrame({ children, variant = 'phone', railActive = false }) {
  if (Platform.OS !== 'web') return children;
  return (
    <WebFrame variant={variant} railActive={railActive}>
      {children}
    </WebFrame>
  );
}

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: CANVAS.sunken,
  },
  frame: {
    flex: 1,
    // width '100%' lets the column shrink on a 521-600px window instead of
    // overflowing; maxWidth caps it once there is room to spare.
    width: '100%',
    maxWidth: FRAME_MAX_WIDTH,
    backgroundColor: CANVAS.base,
    // Hairline sides plus a soft lift so the column reads as a distinct
    // surface against the page rather than bleeding into it.
    ...BORDERS.strong,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    ...ELEVATION.sm,
  },
  appStage: {
    flex: 1,
    backgroundColor: CANVAS.sunken,
  },
  appStageRail: {
    alignItems: 'stretch',
  },
  appStageCentered: {
    alignItems: 'center',
  },
  appFrame: {
    flex: 1,
    width: '100%',
    backgroundColor: CANVAS.base,
  },
  appFrameCapped: {
    maxWidth: APP_MAX_WIDTH,
  },
  mapStage: {
    flex: 1,
    width: '100%',
    backgroundColor: CANVAS.sunken,
    overflow: 'hidden',
  },
});
