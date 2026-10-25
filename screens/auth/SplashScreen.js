import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Platform, Image } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING } from '../../theme';
import TriRideTextLogo from '../../components/TriRideTextLogo';

export default function SplashScreen({ onFinish }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation for logo container
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ])
    ).start();

    // Progress bar animation to simulate loading (faster on web for instant responsiveness)
    const splashDuration = Platform.OS === 'web' ? 400 : 1800;
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: splashDuration,
      useNativeDriver: false, // width animation requires layout reflow
    }).start(() => {
      if (onFinish) {
        onFinish();
      }
    });
  }, []);

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.container}>
      <View style={styles.main}>
        {/* Logo Container */}
        <Animated.View style={[styles.logoOuter, { transform: [{ scale: pulseAnim }] }]}>
          {/* Same artwork as the native splash (assets/splash-icon.png) so the
              hand-off from the OS splash to this screen is seamless. */}
          <Image
            source={require('../../assets/splash-icon.png')}
            style={styles.logoImage}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Title & Subtitle */}
        <View style={{ marginBottom: 4 }}>
          <TriRideTextLogo size="large" />
        </View>
        <Text style={styles.subtitle}>Your reliable tricycle connection</Text>

        {/* Progress Bar Container */}
        <View style={styles.progressBarBg}>
          <Animated.View style={[styles.progressBar, { width: progressWidth }]} />
        </View>
      </View>

      {/* Bottom Tagline */}
      <View style={styles.footer}>
        <MaterialIcons name="shield" size={14} color={COLORS.outline} />
        <Text style={styles.footerText}>Secure Transport</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surfaceContainerLowest,
    justifyContent: 'center',
    alignItems: 'center',
  },
  main: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: SPACING.marginMobile,
  },
  logoOuter: {
    marginBottom: SPACING.lg,
  },
  logoImage: {
    width: 140,
    height: 140,
  },
  title: {
    ...TYPOGRAPHY.headlineLgMobile,
    color: COLORS.primary,
    fontWeight: '800',
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    opacity: 0.8,
    textAlign: 'center',
    marginTop: SPACING.xs,
  },
  progressBarBg: {
    width: 192,
    height: 4,
    backgroundColor: COLORS.outlineVariant,
    borderRadius: 2,
    marginTop: SPACING.xl,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 48,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.outline,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    fontWeight: '600',
  },
});
