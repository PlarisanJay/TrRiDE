import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { COLORS } from '../theme';

/**
 * UserAvatar — universal avatar component for web, Android and iOS.
 *
 * Props:
 *   uri   — remote image URL (https://…). Blob/localhost/http URLs are
 *            rejected on native and fall back to initials automatically.
 *   name  — display name used to generate initials when no image is shown.
 *   size  — diameter in dp (default 40).
 *   style — extra styles applied to the outer container.
 *   textStyle — extra styles for the initials text.
 *
 * Bugs fixed vs previous version:
 * ─────────────────────────────────────────────────────────────────────────
 * 1. StyleSheet.absoluteFillObject on <Image> collapses to 0×0 on Android
 *    when the parent has no explicit height set. Changed to explicit
 *    width/height equal to `size`.
 * 2. overflow:"hidden" was only on avatarBase; the Image itself also carries
 *    borderRadius to clip the circle correctly on Android.
 * 3. No HTTPS guard — blob: URIs from web ImagePicker were being passed to
 *    native builds where they are meaningless. Now rejected with a warning.
 * 4. http:// (non-secure) URLs are blocked by Android's Network Security
 *    Config by default; we detect and skip them.
 * 5. "localhost" / "127.0.0.1" URLs are silently unreachable on a real
 *    device; we skip them on native.
 * 6. Added console.log of the resolved URL and onError details so the real
 *    failure appears in the Expo terminal.
 */
export default function UserAvatar({ uri, name, size = 40, style, textStyle }) {
  const [imageError, setImageError] = useState(false);

  // Reset error state whenever the URI changes
  useEffect(() => {
    setImageError(false);
  }, [uri]);

  // ── Initials fallback ──────────────────────────────────────────
  const initials = (() => {
    const cleaned = (name || 'U').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return (cleaned.slice(0, 2) || 'U').toUpperCase();
  })();

  // ── URI sanity check ───────────────────────────────────────────
  const isUriSafe = (() => {
    if (typeof uri !== 'string' || uri.trim().length === 0) return false;
    const trimmed = uri.trim();

    // blob: URIs from the web ImagePicker are not usable on native
    if (Platform.OS !== 'web' && trimmed.startsWith('blob:')) {
      console.warn('[UserAvatar] blob: URI not usable on native — showing initials.', trimmed.slice(0, 80));
      return false;
    }

    // http:// is blocked by Android Network Security Config by default
    if (Platform.OS === 'android' && trimmed.startsWith('http://')) {
      console.warn('[UserAvatar] http:// blocked on Android — showing initials.', trimmed.slice(0, 80));
      return false;
    }

    // localhost / 127.0.0.1 is unreachable on a real physical device
    if (Platform.OS !== 'web' && (trimmed.includes('localhost') || trimmed.includes('127.0.0.1'))) {
      console.warn('[UserAvatar] localhost URL unreachable on device — showing initials.', trimmed.slice(0, 80));
      return false;
    }

    // file:// URIs on web cannot be displayed (browser security restriction)
    if (Platform.OS === 'web' && trimmed.startsWith('file://')) {
      return false;
    }

    return true;
  })();

  const resolvedUri = isUriSafe ? uri.trim() : null;
  const showImage = resolvedUri !== null && !imageError;

  const radius = size / 2;
  const fontSize = Math.max(11, Math.round(size * 0.42));

  const containerStyle = [
    styles.base,
    { width: size, height: size, borderRadius: radius },
    !showImage && styles.fallback,
    style,
  ];

  if (showImage) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: resolvedUri }}
          // Explicit width/height is REQUIRED on native — absoluteFillObject
          // can collapse to 0×0 when the parent height is not fully resolved.
          // borderRadius on the Image itself is required for Android to clip
          // the image into a circle (overflow:hidden alone is not enough).
          style={{ width: size, height: size, borderRadius: radius }}
          resizeMode="cover"
          onLoad={() => {
            if (__DEV__) {
              console.log('[UserAvatar] ✓ loaded:', resolvedUri.slice(0, 100));
            }
          }}
          onError={(e) => {
            console.warn(
              '[UserAvatar] ✗ failed to load:',
              resolvedUri.slice(0, 100),
              e?.nativeEvent?.error || '(no error detail)'
            );
            setImageError(true);
          }}
        />
      </View>
    );
  }

  // Initials fallback — shown when: no URI, invalid URI, or image load error
  return (
    <View style={containerStyle}>
      <Text
        style={[
          styles.initialsText,
          { fontSize },
          textStyle,
        ]}
        numberOfLines={1}
        allowFontScaling={false}
      >
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    overflow: 'hidden',        // clips Image to circle on iOS & Android
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
  },
  fallback: {
    backgroundColor: COLORS.primary || '#004ac6',
  },
  initialsText: {
    color: '#ffffff',
    fontWeight: '800',
    letterSpacing: 0.5,
    includeFontPadding: false,    // Android: removes unwanted bottom padding
    textAlignVertical: 'center',  // Android: centers text vertically
  },
});

