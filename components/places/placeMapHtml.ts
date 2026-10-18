/** The map page shared by the app's WebView and the web preview's iframe. */
export const buildHtml = (lat: number, lng: number, zoom: number, radius: number) => `<!doctype html>
<html><head>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>
  html, body, #map { margin: 0; height: 100%; background: #0B0B0B; }
  /* OpenStreetMap's light tiles, flipped dark to match the app. */
  .leaflet-tile-pane { filter: invert(1) hue-rotate(180deg) brightness(0.9) contrast(0.9); }
  .leaflet-control-attribution { background: rgba(11,11,11,0.7) !important; color: #888 !important; font-size: 9px; }
  .leaflet-control-attribution a { color: #A8FF3E !important; }
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  // In the app this is the WebView bridge; the web preview's iframe posts to its parent.
  const post = (m) => (window.ReactNativeWebView || { postMessage: (d) => parent.postMessage(d, '*') }).postMessage(JSON.stringify(m));
  if (!window.L) {
    post({ type: 'offline' });
  } else {
    const map = L.map('map', { zoomControl: false }).setView([${lat}, ${lng}], ${zoom});
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
    let failed = 0;
    tiles.on('tileerror', () => { if (++failed === 6) post({ type: 'offline' }); });
    tiles.on('tileload', () => { failed = 0; });
    const circle = L.circle(map.getCenter(), {
      radius: ${radius}, color: '#A8FF3E', weight: 2, fillColor: '#A8FF3E', fillOpacity: 0.12
    }).addTo(map);
    map.on('move', () => circle.setLatLng(map.getCenter()));
    map.on('moveend', () => { const c = map.getCenter(); post({ type: 'move', lat: c.lat, lng: c.lng }); });
    window.moveTo = (a, b, z) => map.setView([a, b], z || Math.max(map.getZoom(), 16));
    window.setRadius = (r) => circle.setRadius(r);
  }
</script>
</body></html>`;
