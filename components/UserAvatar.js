import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleSheet, Platform } from 'react-native';
import { COLORS } from '../theme';

/**
 * Universal UserAvatar Component
 * Handles remote photos, local photos, and falls back to a clean initial circle if missing or error.
 */
export default function UserAvatar({ uri, name, size = 40, style, textStyle }) {
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [uri]);

  const initials = (name || 'U')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || 'U';

  const containerStyle = [
    styles.avatarBase,
    { width: size, height: size, borderRadius: size / 2 },
    style,
  ];

  const trimmedUri = typeof uri === 'string' ? uri.trim() : '';
  const isLocalFileOnWeb = Platform.OS === 'web' && trimmedUri.startsWith('file://');
  const hasValidUri = trimmedUri.length > 0 && !isLocalFileOnWeb && !imageError;

  if (hasValidUri) {
    return (
      <View style={containerStyle}>
        <Image
          source={{ uri: trimmedUri }}
          style={StyleSheet.absoluteFillObject}
          resizeMode="cover"
          onError={() => setImageError(true)}
        />
      </View>
    );
  }

  return (
    <View style={[containerStyle, styles.fallbackContainer]}>
      <Text style={[{ fontSize: Math.max(12, size * 0.42), fontWeight: '800', color: '#ffffff' }, textStyle]}>
        {initials}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatarBase: {
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#e2e8f0',
  },
  fallbackContainer: {
    backgroundColor: COLORS.primary || '#004ac6',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
