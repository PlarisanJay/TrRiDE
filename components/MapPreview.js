import React, { useRef, useCallback, useState } from 'react';
import { View, Image, Modal, TouchableOpacity, StyleSheet, StatusBar, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TOLEDO_CITY, buildLeafletHtml, buildStaticMapUrl } from '../config/mapConfig';
import { COLORS } from '../theme';

let WebView = null;
if (Platform.OS !== 'web') {
  WebView = require('react-native-webview').WebView;
}

export default function MapPreview({
  style,
  region,
  markers = [],
  scrollEnabled = true,
  onRegionChangeComplete,
}) {
  const webViewRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);

  const lat = region?.latitude || TOLEDO_CITY.latitude;
  const lng = region?.longitude || TOLEDO_CITY.longitude;
  const zoom = region?.latitudeDelta
    ? Math.round(14 - Math.log2(region.latitudeDelta / 0.05))
    : 15;

  const leafletMarkers = markers.map((m) => ({
    lat: m.coordinate?.latitude || m.latitude || TOLEDO_CITY.latitude,
    lng: m.coordinate?.longitude || m.longitude || TOLEDO_CITY.longitude,
    type: m.color === '#006c49' ? 'destination' : m.type || 'pickup',
  }));

  const staticMapUrl = buildStaticMapUrl({ lat, lng, zoom, markers: leafletMarkers, width: 600, height: 400 });

  const html = buildLeafletHtml({ lat, lng, zoom, scrollEnabled, markers: leafletMarkers });

  const onWebViewLoad = useCallback(() => {
    setTimeout(() => {
      webViewRef.current?.postMessage?.(JSON.stringify({ type: 'markers', markers: leafletMarkers }));
    }, 800);
  }, [leafletMarkers]);

  const onMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'region' && onRegionChangeComplete) {
        onRegionChangeComplete({ latitude: data.lat, longitude: data.lng, zoom: data.zoom });
      }
    } catch (e) {}
  };

  if (Platform.OS === 'web') {
    return (
      <View style={[styles.container, style]}>
        <Image source={{ uri: staticMapUrl }} style={styles.image} resizeMode="cover" />
      </View>
    );
  }

  return (
    <>
      <View style={[styles.container, style]}>
        <WebView
          ref={webViewRef}
          source={{ html, baseUrl: 'https://www.openstreetmap.org' }}
          style={styles.webview}
          onMessage={onMessage}
          onLoad={onWebViewLoad}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          allowsInlineMediaPlayback
          scrollEnabled={false}
        />
        <TouchableOpacity style={styles.expandBtn} onPress={() => setFullscreen(true)} activeOpacity={0.7}>
          <MaterialIcons name="fullscreen" size={20} color={COLORS.onSurfaceVariant} />
        </TouchableOpacity>
      </View>

      <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
        <View style={styles.fullscreenContainer}>
          <StatusBar hidden />
          <WebView
            source={{ html, baseUrl: 'https://www.openstreetmap.org' }}
            style={styles.webview}
            originWhitelist={['*']}
            javaScriptEnabled
            domStorageEnabled
            allowsInlineMediaPlayback
            scrollEnabled={false}
          />
          <TouchableOpacity style={styles.closeBtn} onPress={() => setFullscreen(false)} activeOpacity={0.7}>
            <MaterialIcons name="fullscreen-exit" size={24} color="#ffffff" />
          </TouchableOpacity>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  image: {
    width: '100%',
    height: '100%',
    backgroundColor: '#e5e3df',
  },
  webview: {
    flex: 1,
  },
  expandBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    zIndex: 10,
  },
  fullscreenContainer: {
    flex: 1,
    backgroundColor: '#e5e3df',
  },
  closeBtn: {
    position: 'absolute',
    top: 50,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 100,
  },
});
