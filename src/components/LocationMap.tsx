import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';

import { radius, usePalette } from '@/lib/theme';

export type MapPoint = { lat: number; lng: number };

// A small OpenStreetMap view (Leaflet in a WebView) showing the child's latest position, its accuracy circle, and
// the recent breadcrumb trail. Kept self-contained: no map SDK or native module, just the WebView the app already
// ships. Rendered only when there is a point to show; the parent screen falls back to "open in maps" otherwise.
export function LocationMap({ lat, lng, accuracy, trail, height = 300 }: { lat: number; lng: number; accuracy?: number | null; trail?: MapPoint[]; height?: number }) {
  const p = usePalette();
  // Re-mount the WebView when the data changes so Leaflet re-centres on the new point.
  const html = useMemo(() => buildHtml(lat, lng, accuracy ?? null, trail ?? [], p.brandFill), [lat, lng, accuracy, trail, p.brandFill]);
  return (
    <View style={[styles.wrap, { height, borderColor: p.line, backgroundColor: p.fill }]}>
      <WebView
        originWhitelist={['*']}
        source={{ html }}
        style={styles.web}
        scrollEnabled={false}
        androidLayerType="hardware"
        javaScriptEnabled
        domStorageEnabled
      />
    </View>
  );
}

function buildHtml(lat: number, lng: number, accuracy: number | null, trail: MapPoint[], brand: string): string {
  const pts = JSON.stringify(trail.filter((t) => Number.isFinite(t.lat) && Number.isFinite(t.lng)).map((t) => [t.lat, t.lng]));
  const acc = accuracy != null && accuracy > 0 ? Math.min(accuracy, 2000) : 0;
  return `<!doctype html><html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no"/>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
<style>html,body,#m{margin:0;height:100%;width:100%;background:#e9eef5}.leaflet-control-attribution{font-size:9px}</style>
</head><body><div id="m"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var lat=${lat}, lng=${lng}, acc=${acc}, brand=${JSON.stringify(brand)}, trail=${pts};
  var map=L.map('m',{zoomControl:true,attributionControl:true}).setView([lat,lng],16);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap'}).addTo(map);
  if(trail.length>1){L.polyline(trail,{color:brand,weight:4,opacity:0.6}).addTo(map);}
  if(acc>0){L.circle([lat,lng],{radius:acc,color:brand,weight:1,fillColor:brand,fillOpacity:0.12}).addTo(map);}
  L.circleMarker([lat,lng],{radius:9,color:'#fff',weight:3,fillColor:brand,fillOpacity:1}).addTo(map);
  setTimeout(function(){map.invalidateSize();},200);
</script></body></html>`;
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.l, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: 'transparent' },
});
