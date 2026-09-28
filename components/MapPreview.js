import React, { useRef, useCallback, useState, useEffect, useMemo, forwardRef, useImperativeHandle } from 'react';
import { View, Image, Modal, TouchableOpacity, Text, StyleSheet, StatusBar, Platform } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { TOLEDO_CITY, buildLeafletHtml, buildStaticMapUrl } from '../config/mapConfig';
import { COLORS } from '../theme';

let cachedWebView = null;
function getWebViewComponent() {
  if (!cachedWebView && Platform.OS !== 'web') {
    try {
      cachedWebView = require('react-native-webview').WebView;
    } catch (e) {
      console.warn('WebView not available:', e);
    }
  }
  return cachedWebView;
}

const MapPreview = forwardRef(function MapPreview(
  {
    style,
    region,
    markers = [],
    routeCoordinates = [],
    durationText = '30 MIN',
    scrollEnabled = true,
    showControls = false,
    onRegionChangeComplete,
    onMapPress,
  },
  ref
) {
  const webViewRef = useRef(null);
  const iframeRef = useRef(null);
  const isLoadedRef = useRef(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [useStaticFallback, setUseStaticFallback] = useState(false);
  const [centerOverride, setCenterOverride] = useState(null);

  const activeLat = centerOverride?.lat || region?.latitude || TOLEDO_CITY.latitude;
  const activeLng = centerOverride?.lng || region?.longitude || TOLEDO_CITY.longitude;
  const zoom = region?.latitudeDelta
    ? Math.round(14 - Math.log2(region.latitudeDelta / 0.05))
    : 15;

  const leafletMarkers = useMemo(() => {
    return (markers || []).map((m) => {
      const isDriver = m.id === 'driver' || m.type === 'driver' || m.isDriver;
      const isDest = !isDriver && (m.id === 'destination' || m.type === 'destination' || m.color === '#2563eb' || m.color === '#006c49');
      return {
        id: isDriver ? 'driver' : isDest ? 'destination' : 'pickup',
        lat: m.coordinate?.latitude || m.latitude || TOLEDO_CITY.latitude,
        lng: m.coordinate?.longitude || m.longitude || TOLEDO_CITY.longitude,
        type: isDriver ? 'driver' : isDest ? 'destination' : 'pickup',
        color: isDriver ? '#16a34a' : isDest ? '#2563eb' : '#f97316',
        label: m.label || (isDriver ? (m.statusText || 'Driver') : isDest ? 'Drop-off' : 'Pick-up'),
        statusText: m.statusText || (isDriver ? 'ON THE WAY' : isDest ? 'Drop-off' : 'Pick-up'),
      };
    });
  }, [markers]);

  // Stable HTML source: generated once so native WebView NEVER reloads
  const htmlSource = useMemo(() => {
    return {
      html: buildLeafletHtml({
        lat: activeLat,
        lng: activeLng,
        zoom,
        scrollEnabled,
        markers: leafletMarkers,
        route: routeCoordinates,
        durationText,
      }),
      baseUrl: 'https://www.openstreetmap.org',
    };
  }, [scrollEnabled]);

  const staticMapUrl = useMemo(() => {
    return buildStaticMapUrl({
      lat: activeLat,
      lng: activeLng,
      zoom,
      markers: leafletMarkers,
      width: 600,
      height: 380,
    });
  }, [activeLat, activeLng, zoom, leafletMarkers]);

  // Send update directly to JavaScript inside WebView without reloading HTML
  const sendUpdate = useCallback((data) => {
    if (Platform.OS === 'web') {
      try {
        iframeRef.current?.contentWindow?.postMessage?.(JSON.stringify(data), '*');
      } catch (e) {}
    } else if (webViewRef.current) {
      try {
        const script = `if (window.handleMapMessage) { window.handleMapMessage(${JSON.stringify(data)}); } true;`;
        webViewRef.current.injectJavaScript(script);
      } catch (e) {}
    }
  }, []);

  useImperativeHandle(ref, () => ({
    recenter: (reLat, reLng) => {
      const targetLat = reLat || activeLat;
      const targetLng = reLng || activeLng;
      setCenterOverride({ lat: targetLat, lng: targetLng });
      sendUpdate({
        type: 'recenter',
        lat: targetLat,
        lng: targetLng,
        zoom: 15,
      });
    },
    fitBounds: () => {
      sendUpdate({ type: 'fitbounds' });
    },
  }), [sendUpdate, activeLat, activeLng]);

  const onWebViewLoad = useCallback(() => {
    isLoadedRef.current = true;
    sendUpdate({
      type: 'route',
      route: routeCoordinates,
      duration: durationText,
      markers: leafletMarkers,
    });
    if (region?.latitude && region?.longitude) {
      sendUpdate({
        type: 'region',
        lat: region.latitude,
        lng: region.longitude,
      });
    }
  }, [routeCoordinates, durationText, leafletMarkers, region?.latitude, region?.longitude, sendUpdate]);

  // Sync route and markers when they change without reloading the page
  useEffect(() => {
    if (isLoadedRef.current) {
      sendUpdate({
        type: 'route',
        route: routeCoordinates,
        duration: durationText,
        markers: leafletMarkers,
      });
    }
  }, [routeCoordinates, durationText, leafletMarkers, sendUpdate]);

  // Sync region changes
  useEffect(() => {
    if (isLoadedRef.current && region?.latitude && region?.longitude) {
      sendUpdate({
        type: 'region',
        lat: region.latitude,
        lng: region.longitude,
      });
    }
  }, [region?.latitude, region?.longitude, sendUpdate]);

  const onMessage = (event) => {
    try {
      const data = JSON.parse(event.nativeEvent?.data || event.data);
      if (data.type === 'region' && onRegionChangeComplete) {
        onRegionChangeComplete({ latitude: data.lat, longitude: data.lng, zoom: data.zoom });
      } else if (data.type === 'map_click' && onMapPress) {
        onMapPress({ latitude: data.lat, longitude: data.lng });
      }
    } catch (e) {}
  };

  useEffect(() => {
    if (Platform.OS === 'web') {
      const handler = (e) => {
        try {
          const data = typeof e.data === 'string' ? JSON.parse(e.data) : e.data;
          if (data.type === 'region' && onRegionChangeComplete) {
            onRegionChangeComplete({ latitude: data.lat, longitude: data.lng, zoom: data.zoom });
          } else if (data.type === 'map_click' && onMapPress) {
            onMapPress({ latitude: data.lat, longitude: data.lng });
          }
        } catch (err) {}
      };
      window.addEventListener('message', handler);
      return () => window.removeEventListener('message', handler);
    }
  }, [onRegionChangeComplete, onMapPress]);

  const WebViewComp = !useStaticFallback ? getWebViewComponent() : null;

  return (
    <>
      <View style={[styles.container, style]}>
        {useStaticFallback || !WebViewComp ? (
          <Image
            source={{ uri: staticMapUrl }}
            style={styles.staticImage}
            resizeMode="cover"
          />
        ) : Platform.OS === 'web' ? (
          <iframe
            ref={iframeRef}
            srcDoc={htmlSource.html}
            style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#f1f5f9' }}
            title="Map Preview"
            onLoad={onWebViewLoad}
          />
        ) : (
          <WebViewComp
            ref={webViewRef}
            source={htmlSource}
            style={styles.webview}
            onMessage={onMessage}
            onLoadEnd={onWebViewLoad}
            originWhitelist={['*']}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            scrollEnabled={false}
            showsHorizontalScrollIndicator={false}
            showsVerticalScrollIndicator={false}
            overScrollMode="never"
            cacheEnabled={true}
            cacheMode="LOAD_CACHE_ELSE_NETWORK"
            mediaPlaybackRequiresUserAction={true}
            allowsInlineMediaPlayback={false}
            onRenderProcessGone={() => {
              console.warn('Low memory: gracefully switching to static map.');
              setUseStaticFallback(true);
            }}
            onError={() => {
              setUseStaticFallback(true);
            }}
          />
        )}

        {showControls && (
          <TouchableOpacity style={styles.expandBtn} onPress={() => setFullscreen(true)} activeOpacity={0.7}>
            <MaterialIcons name="fullscreen" size={20} color={COLORS.onSurfaceVariant} />
          </TouchableOpacity>
        )}
      </View>

      {/* Fullscreen Modal: Only rendered when user clicks fullscreen */}
      {fullscreen && (
        <Modal visible={fullscreen} animationType="slide" onRequestClose={() => setFullscreen(false)}>
          <View style={styles.fullscreenContainer}>
            <StatusBar hidden />
            {useStaticFallback || !WebViewComp ? (
              <Image source={{ uri: staticMapUrl }} style={styles.staticImage} resizeMode="cover" />
            ) : Platform.OS === 'web' ? (
              <iframe
                srcDoc={htmlSource.html}
                style={{ width: '100%', height: '100%', border: 'none', backgroundColor: '#f1f5f9' }}
                title="Fullscreen Map"
              />
            ) : (
              <WebViewComp
                source={htmlSource}
                style={styles.webview}
                originWhitelist={['*']}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                scrollEnabled={false}
                cacheEnabled={true}
                cacheMode="LOAD_CACHE_ELSE_NETWORK"
              />
            )}
            <TouchableOpacity style={styles.closeBtn} onPress={() => setFullscreen(false)} activeOpacity={0.7}>
              <MaterialIcons name="fullscreen-exit" size={24} color="#ffffff" />
            </TouchableOpacity>
          </View>
        </Modal>
      )}
    </>
  );
});

export default React.memo(MapPreview);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: '#f1f5f9',
  },
  webview: {
    flex: 1,
    backgroundColor: '#f1f5f9',
  },
  staticImage: {
    width: '100%',
    height: '100%',
    backgroundColor: '#f1f5f9',
  },
  liteToggleBtn: {
    position: 'absolute',
    top: 10,
    left: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.94)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    zIndex: 15,
  },
  liteToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    letterSpacing: 0.3,
  },
  liteToggleTextActive: {
    color: '#ea580c',
  },
  liteToggleTextInteractive: {
    color: '#004ac6',
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
    backgroundColor: '#f1f5f9',
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
