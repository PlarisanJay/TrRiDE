import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { COLORS, SPACING, TYPOGRAPHY } from '../../theme';

/**
 * Bottom-of-screen progress row.
 * The fill animates whenever the passenger's status changes:
 * waiting → heading → on board (50%) → dropped off (100%).
 */
export default function PassengerProgressBar({
  seatNumber,
  name,
  statusLabel,
  progress = 0,
  color = COLORS.primary,
  cancelled = false,
  completed = false,
}) {
  const animated = useRef(new Animated.Value(0)).current;
  const [trackWidth, setTrackWidth] = useState(0);

  useEffect(() => {
    Animated.timing(animated, {
      toValue: Math.max(0, Math.min(1, progress)),
      duration: 450,
      // Width cannot be driven natively; this is a small, local animation.
      useNativeDriver: false,
    }).start();
  }, [animated, progress]);

  const percent = Math.round(Math.max(0, Math.min(1, progress)) * 100);
  const fillColor = cancelled ? COLORS.error : completed ? '#16a34a' : color;
  const dotColor = cancelled ? COLORS.error : completed ? '#16a34a' : color;

  return (
    <View style={styles.row}>
      <View style={[styles.seatDot, { backgroundColor: dotColor }]}>
        {cancelled ? (
          <MaterialIcons name="close" size={15} color="#ffffff" />
        ) : completed ? (
          <MaterialIcons name="check" size={15} color="#ffffff" />
        ) : (
          <Text style={styles.seatDotText}>P{seatNumber}</Text>
        )}
      </View>

      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.name} numberOfLines={1}>
            {name || `Passenger ${seatNumber}`}
          </Text>
          <View style={styles.statusWrap}>
            {completed ? (
              <MaterialIcons name="check-circle" size={13} color="#16a34a" />
            ) : cancelled ? (
              <MaterialIcons name="cancel" size={13} color={COLORS.error} />
            ) : null}
            <Text
              style={[
                styles.statusText,
                cancelled && { color: COLORS.error },
                completed && { color: '#15803d' },
              ]}
              numberOfLines={1}
            >
              {statusLabel}
            </Text>
            <Text style={styles.percentText}>{percent}%</Text>
          </View>
        </View>

        <View
          style={styles.track}
          onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
        >
          <Animated.View
            style={[
              styles.fill,
              {
                backgroundColor: fillColor,
                width: animated.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, trackWidth],
                }),
              },
            ]}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
    paddingVertical: 7,
  },
  seatDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatDotText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '800',
  },
  body: {
    flex: 1,
    gap: 5,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  name: {
    ...TYPOGRAPHY.caption,
    color: COLORS.onSurface,
    fontWeight: '700',
    flexShrink: 1,
  },
  statusWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    flexShrink: 1,
  },
  statusText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    color: COLORS.onSurfaceVariant,
  },
  percentText: {
    ...TYPOGRAPHY.caption,
    fontSize: 11,
    fontWeight: '800',
    color: COLORS.onSurfaceVariant,
    marginLeft: 2,
  },
  track: {
    height: 7,
    borderRadius: 4,
    backgroundColor: COLORS.surfaceContainerHigh,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 4,
  },
});
