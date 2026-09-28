import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { COLORS, GRADIENTS, ACCENT } from '../theme';

/**
 * TriRideTextLogo - Custom high-speed athletic text logo component
 * Styled after bold slanted racing/tech typography with connected top accent bar.
 */
export default function TriRideTextLogo({ color = COLORS.primary, size = 'medium', showTag = false, tagText = 'DRIVER', style }) {
  // Scaling factors based on size prop
  let fontSize = 22;
  let topBarHeight = 3.5;
  let topBarOffset = -1;

  if (size === 'small') {
    fontSize = 19;
    topBarHeight = 3;
    topBarOffset = -1;
  } else if (size === 'large') {
    fontSize = 32;
    topBarHeight = 5;
    topBarOffset = -2;
  }

  return (
    <View style={[styles.outerContainer, style]}>
      <View style={styles.logoWrapper}>
        {/* Slanted text container matching speed-italic style */}
        <View style={styles.skewBox}>
          {/* Connected top accent line over logo. Was a flat solid bar in the
              brand colour, which was the most prominent flat-primary element
              on the Home header. The glyph itself still uses `color` because
              React Native Text cannot take a gradient fill without SVG. */}
          <LinearGradient
            {...GRADIENTS.horizontal}
            style={[styles.topBarLine, { height: topBarHeight, top: topBarOffset }]}
          />
          
          <View style={styles.textRow}>
            <Text style={[styles.logoText, { fontSize, color }]}>
              TRI<Text style={styles.rideText}>RIDE</Text>
            </Text>
          </View>
        </View>
      </View>

      {showTag && (
        <View style={styles.driverTag}>
          <Text style={styles.driverTagText}>{tagText}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  outerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  logoWrapper: {
    justifyContent: 'center',
  },
  skewBox: {
    transform: [{ skewX: '-16deg' }],
    position: 'relative',
    paddingTop: 3,
  },
  topBarLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderRadius: 1,
  },
  textRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoText: {
    fontWeight: '900',
    letterSpacing: 0.5,
    fontStyle: 'italic',
    includeFontPadding: false,
    textTransform: 'uppercase',
  },
  rideText: {
    fontWeight: '900',
    fontStyle: 'italic',
  },
  driverTag: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 2,
  },
  driverTagText: {
    fontSize: 9,
    fontWeight: '900',
    color: ACCENT.blueDeep,
    letterSpacing: 0.8,
  },
});
