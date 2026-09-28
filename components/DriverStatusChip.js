import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, AccessibilityInfo, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TYPOGRAPHY, ELEVATION, ACCENT, ROUNDED } from '../theme';

// Native driver is off on web to match the rest of the app. Every loop below
// only touches transform/opacity, so they stay on the native driver elsewhere.
const NATIVE = Platform.OS !== 'web';

// Per-status paint. Flat wash + hairline outline, no gradient: the animated
// glyph has to be the loudest thing in the card or the motion reads as noise.
const VARIANTS = {
  waiting: {
    label: 'Waiting',
    tile: ACCENT.greenWash,
    borderColor: 'rgba(22, 163, 74, 0.20)',
    rippleColor: 'rgba(22, 163, 74, 0.35)',
    iconColor: ACCENT.green,
    countColor: ACCENT.greenInk,
    labelColor: ACCENT.greenInkMuted,
  },
  ontrip: {
    label: 'On Trip',
    tile: ACCENT.amberWash,
    borderColor: 'rgba(245, 158, 11, 0.26)',
    dialColor: 'rgba(245, 158, 11, 0.45)',
    iconColor: ACCENT.orangeDeep,
    countColor: ACCENT.amberInk,
    labelColor: ACCENT.amberInkMuted,
  },
};

// Sand falling through the glass: top half fills, then empties, then resets.
const GLASSES = ['hourglass-top', 'hourglass-bottom', 'hourglass-empty'];

/**
 * Honour the OS "reduce motion" setting. A looping icon animation is exactly
 * the kind of thing that setting exists for, so fall back to a static glyph
 * rather than ignoring it.
 */
function useReduceMotion() {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;

    if (typeof AccessibilityInfo.isReduceMotionEnabled === 'function') {
      AccessibilityInfo.isReduceMotionEnabled()
        .then((v) => { if (mounted) setReduced(!!v); })
        .catch(() => { /* platform does not report it; keep animating */ });
    }

    let sub = null;
    try {
      if (typeof AccessibilityInfo.addEventListener === 'function') {
        sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => setReduced(!!v));
      }
    } catch (e) {
      sub = null;
    }

    return () => {
      mounted = false;
      if (sub && typeof sub.remove === 'function') sub.remove();
    };
  }, []);

  return reduced;
}

/** Idle radar: two staggered rings bleeding outward from the hourglass. */
function WaitingGlyph({ color, rippleColor, animate }) {
  const [phase, setPhase] = useState(0);
  const rippleA = useRef(new Animated.Value(0)).current;
  const rippleB = useRef(new Animated.Value(0)).current;
  const loopBRef = useRef(null);

  useEffect(() => {
    if (!animate) return undefined;
    // A timeout chain rather than setInterval, so it tears down cleanly and
    // halts the moment reduce-motion turns on.
    const id = setTimeout(() => setPhase((p) => (p + 1) % GLASSES.length), 700);
    return () => clearTimeout(id);
  }, [phase, animate]);

  useEffect(() => {
    if (!animate) return undefined;

    const bleed = (v) => Animated.loop(
      Animated.timing(v, {
        toValue: 1,
        duration: 1800,
        easing: Easing.out(Easing.ease),
        useNativeDriver: NATIVE,
      })
    );

    const loopA = bleed(rippleA);
    loopA.start();

    // Both rings run the same 1800ms period, so starting the second one 900ms
    // late leaves it permanently half a cycle behind and the stagger never
    // drifts. Ringing through a loop that *starts* with a delay would repeat
    // the delay every cycle and throw the two rings out of phase.
    const id = setTimeout(() => {
      rippleB.setValue(0);
      loopBRef.current = bleed(rippleB);
      loopBRef.current.start();
    }, 900);

    return () => {
      clearTimeout(id);
      loopA.stop();
      if (loopBRef.current) loopBRef.current.stop();
    };
  }, [rippleA, rippleB, animate]);

  // Memoised because the sand-fall phase re-renders this component every
  // 700ms, and a fresh interpolate() node on each pass would make
  // AnimatedProps detach and re-attach the whole ring 1.4x a second.
  const ringA = useMemo(() => ({
    borderColor: rippleColor,
    // Fades to fully transparent exactly where the loop snaps the scale back,
    // so the reset is invisible.
    opacity: rippleA.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.55, 0] }),
    transform: [{ scale: rippleA.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.35] }) }],
  }), [rippleA, rippleColor]);

  const ringB = useMemo(() => ({
    borderColor: rippleColor,
    opacity: rippleB.interpolate({ inputRange: [0, 0.12, 1], outputRange: [0, 0.55, 0] }),
    transform: [{ scale: rippleB.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1.35] }) }],
  }), [rippleB, rippleColor]);

  return (
    <View style={styles.glyphBox}>
      {animate && <Animated.View pointerEvents="none" style={[styles.ripple, ringA]} />}
      {animate && <Animated.View pointerEvents="none" style={[styles.ripple, ringB]} />}
      <MaterialIcons name={animate ? GLASSES[phase] : 'hourglass-empty'} size={20} color={color} />
    </View>
  );
}

/** Under way: car riding a slow vertical bob with a rotating compass dial. */
function OnTripGlyph({ color, dialColor, animate }) {
  const spin = useRef(new Animated.Value(0)).current;
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 3200, easing: Easing.linear, useNativeDriver: NATIVE })
    );
    loop.start();
    return () => loop.stop();
  }, [spin, animate]);

  useEffect(() => {
    if (!animate) return undefined;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE }),
        Animated.timing(bob, { toValue: 0, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [bob, animate]);

  const carStyle = useMemo(() => ({
    transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [0, -1.5] }) }],
  }), [bob]);

  const dialSpin = useMemo(() => ({
    transform: [{ rotate: spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
  }), [spin]);

  return (
    <View style={styles.glyphBox}>
      <Animated.View style={carStyle}>
        <MaterialIcons name="directions-car" size={20} color={color} />
      </Animated.View>

      <Animated.View pointerEvents="none" style={[styles.dial, { borderColor: dialColor }, dialSpin]}>
        <MaterialIcons name="navigation" size={9} color={color} />
      </Animated.View>
    </View>
  );
}

/**
 * A single driver-fleet status on the student Live Drivers card.
 *
 * Replaces the old colour-dot pills: "Waiting" and "On Trip" used to be
 * distinguished by an 8px green/amber circle, which conveyed nothing to a
 * colourblind user and left both statuses looking identical in motion. Each
 * variant now carries its own animated glyph.
 */
export default function DriverStatusChip({ variant = 'waiting', count = 0 }) {
  const paint = VARIANTS[variant] || VARIANTS.waiting;
  const reducedMotion = useReduceMotion();
  const animate = !reducedMotion;

  return (
    <View
      style={[styles.card, ELEVATION.xs, { backgroundColor: paint.tile, borderColor: paint.borderColor }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${count} drivers ${paint.label.toLowerCase()}`}
    >
      {variant === 'ontrip' ? (
        <OnTripGlyph color={paint.iconColor} dialColor={paint.dialColor} animate={animate} />
      ) : (
        <WaitingGlyph color={paint.iconColor} rippleColor={paint.rippleColor} animate={animate} />
      )}

      <Text style={[styles.count, { color: paint.countColor }]}>{count}</Text>
      <Text style={[styles.label, { color: paint.labelColor }]}>{paint.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 8,
    borderRadius: ROUNDED.lg,
    borderWidth: StyleSheet.hairlineWidth,
  },
  glyphBox: {
    width: 32,
    height: 32,
    marginBottom: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ripple: {
    position: 'absolute',
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1.5,
  },
  dial: {
    position: 'absolute',
    top: -3,
    right: -3,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: {
    ...TYPOGRAPHY.headlineMd,
    fontWeight: '800',
  },
  label: {
    ...TYPOGRAPHY.caption,
    fontWeight: '600',
  },
});
