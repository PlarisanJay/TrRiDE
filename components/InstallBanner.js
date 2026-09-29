import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
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
import { LinearGradient } from 'expo-linear-gradient';
import { dismissBanner, isBannerDismissed, resolveInstallTarget, startInstall } from '../lib/installApp';
import { alertDialog } from '../lib/dialog';

/**
 * The "Install app" prompt, in the shape X and TikTok use on the web: a slim
 * full-bleed bar at the top of the site, one line of value, one primary
 * button, one dismiss control.
 *
 * WHY A BANNER AND NOT A MODAL
 * ---------------------------
 * A modal interrupts. This app is already behind a sign-in, so anyone reading
 * it has already committed; a modal would be the second interruption of the
 * session. A bar is visible, dismissible, and out of the way.
 *
 * WHERE IT IS SHOWN
 * -----------------
 * Web only, and only where it can actually do something:
 *   - never on native (you are already in the app)
 *   - never on iOS browsers, because iOS cannot install an APK at all. It
 *     becomes possible in Phase 2, once the PWA manifest enables Add to Home
 *     Screen. Shipping a dead download button is worse than shipping nothing.
 *   - once per browser, then remembered in localStorage
 *
 * It is mounted inside AppShell, so it sits above both the rail and the framed
 * phone column, spanning the viewport the way the X/TikTok bar does.
 */

function WebInstallBanner() {
  const target = resolveInstallTarget();
  const [dismissed, setDismissed] = useState(() => isBannerDismissed());

  if (target.kind !== 'apk' && target.kind !== 'unconfigured') return null;
  if (dismissed) return null;

  const configured = target.kind === 'apk';

  const handleInstall = () => {
    if (!configured) {
      alertDialog({
        title: 'Installer not configured',
        message:
          'The download link has not been set yet. Set EXPO_PUBLIC_APK_URL in .env to the published APK URL, then restart the web bundler.',
      });
      return;
    }
    startInstall(target.url);
  };

  const handleDismiss = () => {
    dismissBanner();
    setDismissed(true);
  };

  const handleBuildDetails = () => {
    if (target.buildUrl) startInstall(target.buildUrl);
  };

  return (
    <View style={styles.bar}>
      <LinearGradient {...GRADIENTS.brandBright} style={styles.mark}>
        <MaterialIcons name="near-me" size={18} color="#ffffff" />
      </LinearGradient>

      <View style={styles.copy}>
        <Text style={styles.title}>Get the TriRide app</Text>
        <Text style={styles.subtitle} numberOfLines={2}>
          Runs full screen on your phone. You will sign in once on the device.
        </Text>
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.button, !configured && styles.buttonDisabled]}
          onPress={handleInstall}
          activeOpacity={configured ? 0.85 : 1}
          accessibilityRole="button"
          accessibilityLabel="Install app"
          accessibilityState={{ disabled: !configured }}
        >
          <MaterialIcons
            name="download"
            size={17}
            color={configured ? '#ffffff' : INK.faint}
          />
          <Text style={[styles.buttonText, !configured && styles.buttonTextDisabled]}>
            Install app
          </Text>
        </TouchableOpacity>

        {configured ? (
          <TouchableOpacity
            style={styles.detailsLink}
            onPress={handleBuildDetails}
            activeOpacity={0.7}
            accessibilityRole="link"
          >
            <Text style={styles.detailsText}>View build details</Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.detailsText}>Installer not configured</Text>
        )}
      </View>

      <TouchableOpacity
        style={styles.dismiss}
        onPress={handleDismiss}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Dismiss install prompt"
        hitSlop={8}
      >
        <MaterialIcons name="close" size={19} color={INK.subtle} />
      </TouchableOpacity>
    </View>
  );
}

export default function InstallBanner() {
  if (Platform.OS !== 'web') return null;
  return <WebInstallBanner />;
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.md,
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    backgroundColor: CANVAS.raised,
    ...BORDERS.strong,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderRightWidth: 0,
    ...ELEVATION.sm,
    zIndex: 120,
  },
  mark: {
    width: 34,
    height: 34,
    borderRadius: ROUNDED.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: {
    flexGrow: 1,
    flexShrink: 1,
    // Below this the copy and the actions fight for the same row; flexWrap
    // then drops the actions to their own line instead of crushing both.
    minWidth: 200,
  },
  title: {
    ...TYPOGRAPHY.button,
    color: INK.strong,
  },
  subtitle: {
    ...TYPOGRAPHY.caption,
    color: INK.slate,
    marginTop: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.md,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.xs,
    paddingVertical: 9,
    paddingHorizontal: SPACING.md,
    borderRadius: ROUNDED.full,
    backgroundColor: ACCENT.blue,
    ...ELEVATION.glow,
  },
  buttonDisabled: {
    backgroundColor: CANVAS.sunken,
    ...ELEVATION.none,
    borderWidth: 1,
    borderColor: BORDERS.strong.borderColor,
  },
  buttonText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
  buttonTextDisabled: {
    color: INK.faint,
  },
  detailsLink: {
    paddingVertical: 4,
  },
  detailsText: {
    ...TYPOGRAPHY.caption,
    color: ACCENT.blueDeep,
    fontWeight: '600',
  },
  dismiss: {
    padding: SPACING.xs,
  },
});
