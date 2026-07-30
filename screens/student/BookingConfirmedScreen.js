import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, TYPOGRAPHY, SPACING, ROUNDED, SHADOWS } from '../../theme';

export default function BookingConfirmedScreen({ onContinue }) {
  const [countdown, setCountdown] = useState(3);

  useEffect(() => {
    if (countdown <= 0) {
      onContinue();
      return;
    }
    const timer = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown, onContinue]);

  return (
    <View style={styles.container}>
      <View style={styles.centerContent}>
        <View style={[styles.checkCircle, SHADOWS.diffusion]}>
          <MaterialIcons name="check" size={64} color={COLORS.secondary} />
        </View>

        <Text style={styles.title}>Booking Confirmed!</Text>
        <Text style={styles.subtitle}>
          Please wait while a driver accepts your ride.
        </Text>

        <View style={styles.infoCard}>
          <View style={styles.infoRow}>
            <MaterialIcons name="info-outline" size={18} color={COLORS.primary} />
            <Text style={styles.infoText}>
              You will be notified once a driver is found. You can continue browsing the app.
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.bottomSection}>
        <TouchableOpacity style={[styles.btnContinue, SHADOWS.diffusion]} activeOpacity={0.8} onPress={onContinue}>
          <Text style={styles.btnContinueText}>Back to Home</Text>
        </TouchableOpacity>
        <Text style={styles.autoText}>Auto-redirect in {countdown}s</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    justifyContent: 'space-between',
    paddingHorizontal: SPACING.marginMobile,
    paddingVertical: SPACING.xl,
  },
  centerContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: SPACING.lg,
  },
  checkCircle: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(0,108,73,0.1)',
    borderWidth: 2,
    borderColor: 'rgba(0,108,73,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  title: {
    ...TYPOGRAPHY.headlineMd,
    color: COLORS.onSurface,
    fontWeight: '700',
    textAlign: 'center',
  },
  subtitle: {
    ...TYPOGRAPHY.body,
    color: COLORS.onSurfaceVariant,
    textAlign: 'center',
    paddingHorizontal: SPACING.lg,
  },
  infoCard: {
    backgroundColor: 'rgba(0,74,198,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(0,74,198,0.15)',
    borderRadius: ROUNDED.md,
    padding: SPACING.md,
    marginTop: SPACING.md,
    maxWidth: 360,
  },
  infoRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
    alignItems: 'flex-start',
  },
  infoText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurfaceVariant,
    flex: 1,
    lineHeight: 18,
  },
  bottomSection: {
    alignItems: 'center',
    gap: SPACING.md,
    paddingBottom: 20,
  },
  btnContinue: {
    width: '100%',
    height: 56,
    backgroundColor: COLORS.primaryContainer,
    borderRadius: ROUNDED.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  btnContinueText: {
    ...TYPOGRAPHY.button,
    color: '#ffffff',
  },
  autoText: {
    ...TYPOGRAPHY.caption,
    color: COLORS.outline,
  },
});
