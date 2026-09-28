const GEOAPIFY_API_KEY = process.env.EXPO_PUBLIC_GEOAPIFY_API_KEY;

export const TOLEDO_CITY = {
  latitude: 10.3312,
  longitude: 123.6478,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

export const MAP_STYLE = 'osm-bright';

export const GEOAPIFY_AUTOCOMPLETE_URL = 'https://api.geoapify.com/v1/geocode/autocomplete';
export const GEOAPIFY_GEOCODE_URL = 'https://api.geoapify.com/v1/geocode/search';

export const GEOAPIFY_ATTRIBUTION_TEXT = 'Powered by Geoapify | © OpenStreetMap contributors | © OpenMapTiles';

export function buildStaticMapUrl({ lat, lng, zoom = 15, markers = [], width = 600, height = 400 }) {
  let url = `https://maps.geoapify.com/v1/staticmap?style=${MAP_STYLE}&width=${width}&height=${height}&center=lonlat:${lng},${lat}&zoom=${zoom}&apiKey=${GEOAPIFY_API_KEY}`;
  if (markers.length > 0) {
    const markerParts = markers.map((m) => {
      const color = (m.id === 'driver' || m.type === 'driver')
        ? '%2316a34a'
        : (m.id === 'destination' || m.type === 'destination')
        ? '%232563eb'
        : '%23f97316';
      return `lonlat:${m.lng},${m.lat};color:${color};size:medium`;
    });
    url += `&marker=${markerParts.join('|')}`;
  }
  return url;
}

export function buildLeafletHtml({ lat, lng, zoom, scrollEnabled, markers = [], route = [], durationText = '30 MIN' }) {
  const apiKey = GEOAPIFY_API_KEY;
  const tileUrl = `https://maps.geoapify.com/v1/tile/${MAP_STYLE}/{z}/{x}/{y}.png?apiKey=${apiKey}`;
  const markersJson = JSON.stringify(markers || []);
  const routeJson = JSON.stringify(route || []);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map {
      width: 100%;
      height: 100%;
      background: #f1f5f9;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      touch-action: pan-x pan-y;
      -webkit-touch-callout: none;
      -webkit-user-select: none;
      user-select: none;
    }
    #loading {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      background: #f1f5f9; z-index: 9999;
      font-size: 13px; color: #64748b; font-weight: 500;
    }
    #loading.hidden { display: none; }
    .leaflet-control-attribution { display: none !important; }

    /* Custom Callout Badges */
    .custom-marker-container {
      position: relative;
      width: 130px;
      height: 68px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: flex-end;
      pointer-events: none;
    }

    .callout-badge-wrapper {
      display: flex;
      align-items: center;
      background: #ffffff;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.18);
      overflow: hidden;
      margin-bottom: 4px;
      white-space: nowrap;
      border: 1px solid rgba(0,0,0,0.06);
    }

    .badge-time {
      color: #ffffff;
      font-size: 9px;
      font-weight: 800;
      line-height: 1.1;
      padding: 4px 6px;
      text-align: center;
      text-transform: uppercase;
      letter-spacing: 0.2px;
    }
    .badge-time.orange { background: #f97316; }
    .badge-time.blue { background: #2563eb; }
    .badge-time.green { background: #16a34a; }
    .badge-time.amber { background: #d97706; }

    .badge-label {
      color: #1e293b;
      font-size: 10px;
      font-weight: 600;
      line-height: 1.15;
      padding: 3px 6px;
      text-align: left;
      max-width: 80px;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* Pinpoint Needle Markers */
    .pinpoint-svg {
      filter: drop-shadow(0 3px 5px rgba(0,0,0,0.38));
      display: block;
    }

    /* Driver Live Radar Pulse */
    .driver-pin-wrap {
      position: relative;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pulse-ring {
      position: absolute;
      bottom: 2px;
      left: 50%;
      transform: translateX(-50%);
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: rgba(22, 163, 74, 0.35);
      animation: driverPulse 1.8s infinite ease-out;
      pointer-events: none;
      z-index: -1;
    }
    @keyframes driverPulse {
      0% { transform: translateX(-50%) scale(0.6); opacity: 0.9; }
      100% { transform: translateX(-50%) scale(2.5); opacity: 0; }
    }
  </style>
</head>
<body>
  <div id="loading">Loading map...</div>
  <div id="map"></div>
  <script>
    if (window.L && window.L.Browser) {
      window.L.Browser.any3d = false;
    }

    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: ${zoom || 15},
      zoomControl: false,
      dragging: ${scrollEnabled !== false ? 'true' : 'false'},
      touchZoom: ${scrollEnabled !== false ? 'true' : 'false'},
      doubleClickZoom: ${scrollEnabled !== false ? 'true' : 'false'},
      scrollWheelZoom: false,
      preferCanvas: true,
      fadeAnimation: false,
      zoomAnimation: false,
      markerZoomAnimation: false
    });

    L.tileLayer('${tileUrl}', {
      attribution: 'Geoapify | OSM',
      maxZoom: 18,
      updateWhenIdle: true,
      updateWhenZooming: false,
      keepBuffer: 1
    }).addTo(map);

    var markersLayer = L.layerGroup().addTo(map);
    var routeLayer = L.layerGroup().addTo(map);
    var currentDuration = ${JSON.stringify(durationText || '30 MIN')};

    function fitAll() {
      var allBounds = L.latLngBounds([]);
      if (routeLayer && routeLayer.getLayers().length > 0) {
        routeLayer.eachLayer(function(l) {
          if (l.getBounds) allBounds.extend(l.getBounds());
        });
      }
      if (markersLayer && markersLayer.getLayers().length > 0) {
        markersLayer.eachLayer(function(l) {
          if (l.getLatLng) allBounds.extend(l.getLatLng());
        });
      }
      if (allBounds.isValid()) {
        try {
          map.fitBounds(allBounds, { padding: [45, 45], maxZoom: 16 });
        } catch(e) {}
      }
    }

    map.whenReady(function() {
      setTimeout(function() {
        map.invalidateSize();
        var el = document.getElementById('loading');
        if (el) el.className = 'hidden';
        fitAll();
      }, 200);
      setTimeout(function() {
        fitAll();
      }, 500);
    });

    function updateRoute(coords) {
      routeLayer.clearLayers();
      if (!coords || coords.length === 0) return;
      var polyline = L.polyline(coords, {
        color: '#000000',
        weight: 4,
        opacity: 0.9,
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(routeLayer);

      fitAll();
    }

    function updateMarkers(mkrs, durText) {
      markersLayer.clearLayers();
      var dur = durText || currentDuration || '30 MIN';

      mkrs.forEach(function(m) {
        var isDriver = (m.id === 'driver' || m.type === 'driver' || m.isDriver);
        var isPickup = (m.id === 'pickup' || m.type === 'pickup' || m.color === '#f97316');
        var html = '';

        if (isDriver) {
          var statusTxt = (m.statusText || 'ON THE WAY').toUpperCase();
          var isStandby = statusTxt.indexOf('STANDBY') !== -1;
          var badgeClass = isStandby ? 'amber' : 'green';
          var badgeLabel = m.label || (isStandby ? 'Standby' : 'Driver');
          html = '<div class="custom-marker-container">' +
            '<div class="callout-badge-wrapper">' +
              '<div class="badge-time ' + badgeClass + '">' + statusTxt + '</div>' +
              '<div class="badge-label">' + badgeLabel + '</div>' +
            '</div>' +
            '<div class="driver-pin-wrap">' +
              '<svg class="pinpoint-svg" width="34" height="42" viewBox="0 0 34 42" fill="none">' +
                '<path d="M17 42C17 42 32 26 32 15.5C32 7.49 25.28 1 17 1C8.72 1 2 7.49 2 15.5C2 26 17 42 17 42Z" fill="' + (isStandby ? '#d97706' : '#16a34a') + '" stroke="#ffffff" stroke-width="2.5"/>' +
                '<circle cx="17" cy="15.5" r="7" fill="#ffffff"/>' +
                '<path d="M13 14.5L17 10.5L21 14.5M17 11V20" stroke="' + (isStandby ? '#d97706' : '#16a34a') + '" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
              '</svg>' +
              '<div class="pulse-ring"></div>' +
            '</div>' +
          '</div>';
        } else if (isPickup) {
          html = '<div class="custom-marker-container">' +
            '<div class="callout-badge-wrapper">' +
              '<div class="badge-time orange">PICK UP</div>' +
              '<div class="badge-label">Pick-up</div>' +
            '</div>' +
            '<svg class="pinpoint-svg" width="30" height="38" viewBox="0 0 30 38" fill="none">' +
              '<path d="M15 38C15 38 28 23.5 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 23.5 15 38 15 38Z" fill="#f97316" stroke="#ffffff" stroke-width="2"/>' +
              '<circle cx="15" cy="14" r="5.5" fill="#ffffff"/>' +
              '<circle cx="15" cy="14" r="3" fill="#f97316"/>' +
            '</svg>' +
          '</div>';
        } else {
          var dropTime = dur ? dur.replace(' ', '<br>') : 'DEST';
          html = '<div class="custom-marker-container">' +
            '<div class="callout-badge-wrapper">' +
              '<div class="badge-time blue">' + dropTime + '</div>' +
              '<div class="badge-label">Drop-off</div>' +
            '</div>' +
            '<svg class="pinpoint-svg" width="30" height="38" viewBox="0 0 30 38" fill="none">' +
              '<path d="M15 38C15 38 28 23.5 28 14C28 6.82 22.18 1 15 1C7.82 1 2 6.82 2 14C2 23.5 15 38 15 38Z" fill="#2563eb" stroke="#ffffff" stroke-width="2"/>' +
              '<circle cx="15" cy="14" r="5.5" fill="#ffffff"/>' +
              '<circle cx="15" cy="14" r="3" fill="#2563eb"/>' +
            '</svg>' +
          '</div>';
        }

        var icon = L.divIcon({
          className: '',
          html: html,
          iconSize: [130, 68],
          iconAnchor: [65, 68]
        });

        L.marker([m.lat, m.lng], { icon: icon }).addTo(markersLayer);
      });

      fitAll();
    }

    var initialMarkers = ${markersJson};
    if (initialMarkers.length > 0) {
      updateMarkers(initialMarkers, currentDuration);
    }

    var initialRoute = ${routeJson};
    if (initialRoute.length > 0) {
      updateRoute(initialRoute);
    }

    window.handleMapMessage = function(data) {
      if (!data) return;
      try {
        if (data.type === 'route') {
          if (data.duration) currentDuration = data.duration;
          updateRoute(data.route);
          if (data.markers) updateMarkers(data.markers, currentDuration);
        } else if (data.type === 'markers') {
          updateMarkers(data.markers, data.duration || currentDuration);
        } else if (data.type === 'recenter') {
          map.setView([data.lat, data.lng], data.zoom || 15, { animate: true });
        } else if (data.type === 'fitbounds') {
          fitAll();
        } else if (data.type === 'region') {
          map.setView([data.lat, data.lng], data.zoom || map.getZoom());
        }
      } catch (err) {}
    };

    function onIncomingEvent(event) {
      try {
        var data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (window.handleMapMessage) window.handleMapMessage(data);
      } catch(e) {}
    }

    window.addEventListener('message', onIncomingEvent);
    document.addEventListener('message', onIncomingEvent);

    map.on('click', function(e) {
      try {
        var msg = JSON.stringify({ type: 'map_click', lat: e.latlng.lat, lng: e.latlng.lng });
        if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
          window.ReactNativeWebView.postMessage(msg);
        }
        if (window.parent && window.parent.postMessage) {
          window.parent.postMessage(msg, '*');
        }
      } catch (err) {}
    });

    var moveTimeout = null;
    map.on('moveend', function() {
      if (moveTimeout) clearTimeout(moveTimeout);
      moveTimeout = setTimeout(function() {
        try {
          var c = map.getCenter();
          var msg = JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng, zoom: map.getZoom() });
          if (window.ReactNativeWebView && window.ReactNativeWebView.postMessage) {
            window.ReactNativeWebView.postMessage(msg);
          }
          if (window.parent && window.parent.postMessage) {
            window.parent.postMessage(msg, '*');
          }
        } catch (e) {}
      }, 350);
    });
  </script>
</body>
</html>`;
}

function downsampleCoordinates(coords, maxPoints = 120) {
  if (!coords || coords.length <= maxPoints) return coords;
  const step = Math.ceil(coords.length / maxPoints);
  const sampled = [];
  for (let i = 0; i < coords.length; i += step) {
    sampled.push(coords[i]);
  }
  const last = coords[coords.length - 1];
  if (sampled[sampled.length - 1] !== last) {
    sampled.push(last);
  }
  return sampled;
}

export function formatDurationText(minutes) {
  if (!minutes || minutes <= 0) return '1 min';
  if (minutes < 60) {
    return `${minutes} min${minutes > 1 ? 's' : ''}`;
  }
  const hrs = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;
  if (remainingMins === 0) {
    return `${hrs} hr${hrs > 1 ? 's' : ''}`;
  }
  return `${hrs} hr${hrs > 1 ? 's' : ''} ${remainingMins} min${remainingMins > 1 ? 's' : ''}`;
}

export function formatDistanceText(meters) {
  if (!meters || meters <= 0) return '0 m';
  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  const km = (meters / 1000).toFixed(1);
  return `${km} km`;
}

export async function fetchRoute(pickupCoords, destCoords) {
  if (!pickupCoords || !destCoords) return null;
  try {
    const url = `https://api.geoapify.com/v1/routing?waypoints=${pickupCoords.latitude},${pickupCoords.longitude}|${destCoords.latitude},${destCoords.longitude}&mode=drive&apiKey=${GEOAPIFY_API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.features && data.features.length > 0) {
      const feat = data.features[0];
      const geom = feat.geometry;
      let rawCoords = [];
      if (geom.type === 'LineString') {
        rawCoords = geom.coordinates;
      } else if (geom.type === 'MultiLineString') {
        rawCoords = geom.coordinates.flat();
      }
      const fullCoords = rawCoords.map(([lng, lat]) => [lat, lng]);
      const latlngs = downsampleCoordinates(fullCoords, 120);
      const durationSeconds = feat.properties?.time || 0;
      const durationMin = Math.max(1, Math.round(durationSeconds / 60));
      const distanceMeters = feat.properties?.distance || 0;
      return {
        coordinates: latlngs,
        durationMinutes: durationMin,
        durationText: formatDurationText(durationMin),
        distanceMeters: distanceMeters,
        distanceText: formatDistanceText(distanceMeters),
      };
    }
  } catch (err) {
    console.warn('Geoapify route fetch error:', err);
  }

  // Fallback to straight line
  const distKm = haversineDistance(pickupCoords.latitude, pickupCoords.longitude, destCoords.latitude, destCoords.longitude);
  const distMeters = Math.round(distKm * 1000);
  const durationMin = Math.max(2, Math.round((distKm / 22) * 60));
  return {
    coordinates: [
      [pickupCoords.latitude, pickupCoords.longitude],
      [destCoords.latitude, destCoords.longitude],
    ],
    durationMinutes: durationMin,
    durationText: formatDurationText(durationMin),
    distanceMeters: distMeters,
    distanceText: formatDistanceText(distMeters),
  };
}

export function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function reverseGeocode(lat, lng) {
  if (!lat || !lng) return 'Current Location';

  // 1. Try Geoapify reverse geocoding
  if (GEOAPIFY_API_KEY) {
    try {
      const url = `https://api.geoapify.com/v1/geocode/reverse?lat=${lat}&lon=${lng}&apiKey=${GEOAPIFY_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.features && data.features.length > 0) {
        const props = data.features[0].properties;
        const street = props.name || props.street || props.address_line1;
        const district = props.suburb || props.district || props.city;
        if (street && district) {
          return `${street}, ${district}`;
        }
        return props.formatted || street || district || 'Current Location';
      }
    } catch (err) {
      console.warn('Geoapify reverse geocoding failed:', err);
    }
  }

  // 2. Native expo-location reverse geocoding
  try {
    const Location = require('expo-location');
    const addresses = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
    if (addresses && addresses.length > 0) {
      const a = addresses[0];
      const name = a.name || a.street;
      const area = a.subregion || a.district || a.city;
      if (name && area) return `${name}, ${area}`;
      return a.formattedAddress || name || area || 'Current Location';
    }
  } catch (err) {}

  return 'Current Location';
}

