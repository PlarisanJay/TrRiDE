import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING } from '../../theme';

export default function SplashScreen({ onFinish }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Pulse animation for logo container
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    ).start();

    // Progress bar animation to simulate loading
    Animated.timing(progressAnim, {
      toValue: 1,
      duration: 2500,
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
      {/* Background Decorative Blobs */}
      <View style={styles.blobTop} />
      <View style={styles.blobBottom} />

      <View style={styles.main}>
        {/* Logo Container */}
        <Animated.View style={[styles.logoOuter, { transform: [{ scale: pulseAnim }] }]}>
          <View style={styles.logoContainer}>
            <MaterialIcons name="directions-car" size={72} color="#ffffff" />
          </View>
        </Animated.View>

        {/* Title & Subtitle */}
        <Text style={styles.title}>TriRide</Text>
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
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blobTop: {
    position: 'absolute',
    top: -100,
    right: -100,
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: COLORS.inversePrimary,
    opacity: 0.15,
  },
  blobBottom: {
    position: 'absolute',
    bottom: -120,
    left: -120,
    width: 300,
    height: 300,
    borderRadius: 150,
    backgroundColor: COLORS.secondaryContainer,
    opacity: 0.1,
  },
  main: {
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: SPACING.marginMobile,
  },
  logoOuter: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
    marginBottom: SPACING.lg,
  },
  logoContainer: {
    width: 120,
    height: 120,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
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
