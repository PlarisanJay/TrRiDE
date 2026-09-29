import React, { useRef, useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Animated, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  TYPOGRAPHY,
  ELEVATION,
  GRADIENTS,
  INK,
  CANVAS,
  ACCENT,
  BORDERS,
} from '../theme';
// Tab lists moved to lib/nav.js so the desktop rail (components/AppSidebar.js)
// and this bar cannot drift apart. This file's behaviour is unchanged.
import { STUDENT_TABS, tabsForRole } from '../lib/nav';

const INDICATOR_W = 40;

function NavTab({ tab, isActive, showBadge, unreadMessagesCount, badgeScale, onPress, onLayout }) {
  const pressScale = useRef(new Animated.Value(1)).current;
  // Active tabs sit slightly higher than inactive ones, so the eye is drawn
  // to the current location without needing a heavy fill.
  const lift = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(lift, {
      toValue: isActive ? -2 : 0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 6,
    }).start();
  }, [isActive, lift]);

  const handlePress = () => {
    Animated.sequence([
      Animated.timing(pressScale, {
        toValue: 0.9,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(pressScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 8,
      }),
    ]).start();
    onPress();
  };

  const isMessages = tab.key === 'Messages';

  return (
    <Animated.View
      onLayout={onLayout}
      style={[
        styles.navItemWrap,
        {
          transform: [
            { scale: pressScale },
            { translateY: lift },
          ],
        },
      ]}
    >
      <TouchableOpacity
        style={styles.navItem}
        activeOpacity={0.7}
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityState={{ selected: isActive }}
        accessibilityLabel={tab.label}
      >
        <View style={styles.iconContainer}>
          <MaterialIcons
            name={tab.icon}
            size={23}
            color={isActive ? ACCENT.blueDeep : INK.subtle}
          />
          {isMessages && showBadge && (
            <Animated.View
              style={[
                styles.notificationBadge,
                unreadMessagesCount > 0 ? styles.countBadge : styles.dotBadge,
                { transform: [{ scale: badgeScale }] },
              ]}
            >
              {unreadMessagesCount > 0 ? (
                <Text style={styles.badgeText}>
                  {unreadMessagesCount > 9 ? '9+' : unreadMessagesCount}
                </Text>
              ) : null}
            </Animated.View>
          )}
        </View>
        <Text style={[styles.navText, isActive && styles.navTextActive]}>{tab.label}</Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function BottomNavBar({
  userRole,
  currentScreen,
  onNavigate,
  onBookRide,
  unreadMessagesCount = 0,
  hasUnreadMessages = false,
}) {
  const isDriver = userRole === 'driver';
  const tabs = tabsForRole(userRole);
  const showBadge = (unreadMessagesCount > 0 || hasUnreadMessages) && currentScreen !== 'Messages';

  // Measured tab positions, so the indicator can slide to the real slot
  // even though the student bar has a FAB-sized gap in the middle.
  const [layouts, setLayouts] = useState({});

  const indicatorX = useRef(new Animated.Value(0)).current;
  const indicatorOpacity = useRef(new Animated.Value(0)).current;
  const barOpacity = useRef(new Animated.Value(0)).current;
  const barY = useRef(new Animated.Value(14)).current;
  const fabScale = useRef(new Animated.Value(1)).current;
  // `rotate` is the one transform key React Native requires to be a string
  // ending in `deg` or `rad` (Libraries/StyleSheet/processTransform.js).
  // An Animated.Value resolves to a bare number, which throws an Invariant
  // Violation on the native-driver path, so drive the rotation as a number
  // here and interpolate it to a degrees string at the point of use.
  const fabRotate = useRef(new Animated.Value(0)).current;
  const fabRotateDeg = fabRotate.interpolate({
    inputRange: [-12, 0],
    outputRange: ['-12deg', '0deg'],
  });
  const badgeScale = useRef(new Animated.Value(1)).current;

  // Entry: the bar fades and settles rather than popping in.
  useEffect(() => {
    Animated.parallel([
      Animated.timing(barOpacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.spring(barY, {
        toValue: 0,
        useNativeDriver: true,
        speed: 16,
        bounciness: 4,
      }),
    ]).start();
  }, [barOpacity, barY]);

  // Active indicator slides to whichever tab is current.
  useEffect(() => {
    const l = layouts[currentScreen];
    if (!l) return;
    Animated.parallel([
      Animated.spring(indicatorX, {
        toValue: l.x + l.width / 2 - INDICATOR_W / 2,
        useNativeDriver: true,
        speed: 18,
        bounciness: 6,
      }),
      Animated.timing(indicatorOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
    ]).start();
  }, [currentScreen, layouts, indicatorX, indicatorOpacity]);

  // Pulse the badge when new activity arrives.
  useEffect(() => {
    if (showBadge) {
      Animated.sequence([
        Animated.timing(badgeScale, {
          toValue: 1.25,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(badgeScale, {
          toValue: 1,
          duration: 180,
          useNativeDriver: Platform.OS !== 'web',
        }),
      ]).start();
    }
  }, [showBadge, unreadMessagesCount, badgeScale]);

  const handleMeasure = useCallback((key) => (e) => {
    const { x, width } = e.nativeEvent.layout;
    setLayouts((prev) => (prev[key] && prev[key].x === x && prev[key].width === width
      ? prev
      : { ...prev, [key]: { x, width } }));
  }, []);

  const handleTabPress = useCallback((screenKey) => {
    onNavigate(screenKey);
  }, [onNavigate]);

  const handleFabPress = () => {
    Animated.sequence([
      Animated.timing(fabScale, {
        toValue: 0.88,
        duration: 90,
        useNativeDriver: true,
      }),
      Animated.spring(fabScale, {
        toValue: 1,
        useNativeDriver: true,
        speed: 18,
        bounciness: 10,
      }),
    ]).start();
    // Small nudge on the glyph so the tap feels connected to the icon.
    Animated.sequence([
      Animated.timing(fabRotate, { toValue: -12, duration: 90, useNativeDriver: true }),
      Animated.spring(fabRotate, { toValue: 0, useNativeDriver: true, speed: 20 }),
    ]).start();

    if (onBookRide) {
      onBookRide();
    } else {
      onNavigate('BookRide');
    }
  };

  const renderTabItem = (tab) => (
    <NavTab
      key={tab.key}
      tab={tab}
      isActive={currentScreen === tab.key}
      showBadge={showBadge}
      unreadMessagesCount={unreadMessagesCount}
      badgeScale={badgeScale}
      onPress={() => handleTabPress(tab.key)}
      onLayout={handleMeasure(tab.key)}
    />
  );

  const indicator = (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.indicatorTrack,
        { opacity: indicatorOpacity, transform: [{ translateX: indicatorX }] },
      ]}
    >
      <LinearGradient
        {...GRADIENTS.horizontal}
        style={styles.indicatorFill}
      />
    </Animated.View>
  );

  if (isDriver) {
    return (
      <Animated.View
        style={[
          styles.navWrapper,
          { opacity: barOpacity, transform: [{ translateY: barY }] },
        ]}
      >
        <View style={styles.bottomNav}>
          {indicator}
          {tabs.map((tab) => renderTabItem(tab))}
        </View>
      </Animated.View>
    );
  }

  // Student nav with centered FAB
  return (
    <Animated.View
      style={[
        styles.navWrapper,
        { opacity: barOpacity, transform: [{ translateY: barY }] },
      ]}
    >
      {/* Floating Center Book Ride FAB */}
      <View style={styles.fabWrapper}>
        <Animated.View
          style={[
            { transform: [{ scale: fabScale }] },
            ELEVATION.glow,
          ]}
        >
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleFabPress}
            accessibilityRole="button"
            accessibilityLabel="Book a ride"
            style={styles.fabTouch}
          >
            <LinearGradient
              {...GRADIENTS.brand}
              style={styles.fab}
            >
              <Animated.View style={{ transform: [{ rotate: fabRotateDeg }] }}>
                <MaterialIcons name="near-me" size={26} color={CANVAS.raised} />
              </Animated.View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      </View>

      <View style={styles.bottomNav}>
        {indicator}

        {/* Left half: Home, Orders */}
        {STUDENT_TABS.slice(0, 2).map((tab) => renderTabItem(tab))}

        {/* FAB Space Reservation */}
        <View style={styles.navFabPlaceholder} />

        {/* Right half: Messages, Profile */}
        {STUDENT_TABS.slice(2).map((tab) => renderTabItem(tab))}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  navWrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 90,
  },
  bottomNav: {
    height: 76,
    // Was a hard 1px COLORS.outlineVariant rule. A soft upward shadow plus a
    // hairline reads as a floating surface rather than a drawn line.
    backgroundColor: CANVAS.raised,
    ...ELEVATION.lg,
    ...BORDERS.hair,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(15, 23, 42, 0.04)',
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingBottom: 8,
  },
  navItemWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  navItem: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
    minWidth: 60,
  },
  iconContainer: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Sliding active indicator
  indicatorTrack: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: INDICATOR_W,
    height: 4,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 0,
  },
  indicatorFill: {
    width: INDICATOR_W - 10,
    height: 4,
    borderRadius: 2,
  },

  notificationBadge: {
    position: 'absolute',
    backgroundColor: ACCENT.red,
    borderColor: CANVAS.raised,
    borderWidth: 1.5,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  dotBadge: {
    top: -2,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 4.5,
  },
  countBadge: {
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  badgeText: {
    color: CANVAS.raised,
    fontSize: 10,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 12,
  },

  navText: {
    ...TYPOGRAPHY.navLabel,
    color: INK.subtle,
    marginTop: 4,
  },
  navTextActive: {
    color: ACCENT.blueDeep,
    fontWeight: '700',
  },

  navFabPlaceholder: {
    width: 68,
  },
  fabWrapper: {
    position: 'absolute',
    top: -26,
    alignSelf: 'center',
    zIndex: 100,
  },
  // The lift lives on the touchable, not the gradient, so the shadow can
  // paint outside the gradient's rounded bounds.
  fabTouch: {
    borderRadius: 29,
    ...ELEVATION.glow,
  },
  fab: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
