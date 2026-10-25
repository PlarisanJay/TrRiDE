import { Platform, StyleSheet, useWindowDimensions } from 'react-native';

/**
 * Web-only layout helpers. Native always gets false / unused styles so phone
 * screens keep their existing stacked map + sheet layout.
 */

export const WIDE_WEB_BREAKPOINT = 768;

export const MAP_SCREENS = [
  'BookRide',
  'TrackDriver',
  'OrderDetails',
  'CurrentTrip',
  'MultiPassengerRide',
];

export const AUTH_SCREENS = ['Splash', 'Login', 'Register'];

export function useWideWeb() {
  const { width } = useWindowDimensions();
  return Platform.OS === 'web' && width >= WIDE_WEB_BREAKPOINT;
}

export function frameVariantForScreen(currentScreen, hasSession) {
  if (MAP_SCREENS.includes(currentScreen)) return 'map';
  if (hasSession && !AUTH_SCREENS.includes(currentScreen)) return 'app';
  return 'phone';
}

export const wideMapStyles = StyleSheet.create({
  mapSection: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flex: 1,
    minHeight: 0,
    zIndex: 1,
  },
  sheetContainer: {
    position: 'absolute',
    top: 16,
    bottom: 16,
    left: 16,
    width: 420,
    maxWidth: 420,
    marginTop: 0,
    borderRadius: 24,
    flexGrow: 0,
    flexShrink: 0,
    zIndex: 20,
    overflow: 'hidden',
  },
  sheetSearch: {
    top: 16,
    bottom: 16,
    width: 460,
    maxWidth: 460,
  },
  floatingHeaderArea: {
    left: 452,
  },
});
