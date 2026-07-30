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
      const color = m.type === 'destination' ? '%23006c49' : '%23004ac6';
      return `lonlat:${m.lng},${m.lat};color:${color};size:medium`;
    });
    url += `&marker=${markerParts.join('|')}`;
  }
  return url;
}

export function buildLeafletHtml({ lat, lng, zoom, scrollEnabled, markers }) {
  const apiKey = GEOAPIFY_API_KEY;
  const tileUrl = `https://maps.geoapify.com/v1/tile/${MAP_STYLE}/{z}/{x}/{y}.png?apiKey=${apiKey}`;
  const markersJson = JSON.stringify(markers || []);

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
  <script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body, #map { width: 100%; height: 100%; background: #e5e3df; }
    #loading {
      position: absolute; top: 0; left: 0; right: 0; bottom: 0;
      display: flex; align-items: center; justify-content: center;
      background: #e5e3df; z-index: 9999;
      font-family: sans-serif; font-size: 14px; color: #666;
    }
    #loading.hidden { display: none; }
    .leaflet-control-attribution { font-size: 8px !important; }
    .custom-marker {
      display: flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 14px;
      border: 3px solid #fff; box-shadow: 0 2px 6px rgba(0,0,0,0.3);
    }
    .marker-pickup { background: #004ac6; }
    .marker-destination { background: #006c49; }
  </style>
</head>
<body>
  <div id="loading">Loading map...</div>
  <div id="map"></div>
  <script>
    var map = L.map('map', {
      center: [${lat}, ${lng}],
      zoom: ${zoom || 15},
      zoomControl: false,
      dragging: ${scrollEnabled !== false ? 'true' : 'false'},
      touchZoom: ${scrollEnabled !== false ? 'true' : 'false'},
      doubleClickZoom: ${scrollEnabled !== false ? 'true' : 'false'},
      scrollWheelZoom: false
    });

    L.tileLayer('${tileUrl}', {
      attribution: 'Geoapify | OSM',
      maxZoom: 20
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    map.whenReady(function() {
      setTimeout(function() {
        map.invalidateSize();
        document.getElementById('loading').className = 'hidden';
      }, 500);
    });

    var markersLayer = L.layerGroup().addTo(map);

    function updateMarkers(mkrs) {
      markersLayer.clearLayers();
      mkrs.forEach(function(m) {
        var icon = L.divIcon({
          className: '',
          html: '<div class="custom-marker marker-' + m.type + '"></div>',
          iconSize: [28, 28],
          iconAnchor: [14, 14]
        });
        L.marker([m.lat, m.lng], { icon: icon }).addTo(markersLayer);
      });
    }

    var initialMarkers = ${markersJson};
    if (initialMarkers.length > 0) {
      updateMarkers(initialMarkers);
    }

    window.addEventListener('message', function(event) {
      try {
        var data = JSON.parse(event.data);
        if (data.type === 'markers') {
          updateMarkers(data.markers);
        } else if (data.type === 'region') {
          map.setView([data.lat, data.lng], data.zoom || map.getZoom());
        }
      } catch(e) {}
    });

    map.on('moveend', function() {
      var c = map.getCenter();
      window.ReactNativeWebView && window.ReactNativeWebView.postMessage(
        JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng, zoom: map.getZoom() })
      );
    });
  </script>
</body>
</html>`;
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
