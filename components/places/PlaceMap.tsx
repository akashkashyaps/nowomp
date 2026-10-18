import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, fonts } from '@/constants/theme';
import { buildHtml } from './placeMapHtml';

export interface PlaceMapHandle {
  /** Moves the map (and so the pin) to a point. */
  moveTo(latitude: number, longitude: number, zoom?: number): void;
}

/**
 * A pick-a-point map: OpenStreetMap in a WebView, with the pin fixed in the
 * middle and the radius drawn around it. Drag the map under the pin; the new
 * centre is reported through `onMove`. No Google Maps key or SDK involved.
 *
 * The map needs internet. Without it, `onOffline` fires and the screen falls
 * back to saving where you're standing.
 */
export const PlaceMap = forwardRef<
  PlaceMapHandle,
  {
    latitude: number;
    longitude: number;
    zoom: number;
    radius: number;
    onMove: (latitude: number, longitude: number) => void;
    onOffline?: () => void;
  }
>(function PlaceMap({ latitude, longitude, zoom, radius, onMove, onOffline }, ref) {
  const web = useRef<WebView>(null);
  const [offline, setOffline] = useState(false);

  // Only the first position goes into the HTML; later moves are injected, so
  // the page never reloads.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(latitude, longitude, zoom, radius), []);

  useImperativeHandle(ref, () => ({
    moveTo(lat, lng, z) {
      web.current?.injectJavaScript(`window.moveTo(${lat}, ${lng}, ${z ?? 'null'}); true;`);
    },
  }));

  // Keep the drawn circle in step with the chosen radius.
  useEffect(() => {
    web.current?.injectJavaScript(`window.setRadius && window.setRadius(${radius}); true;`);
  }, [radius]);

  const goOffline = () => {
    setOffline(true);
    onOffline?.();
  };

  if (offline) {
    return (
      <View style={[styles.box, styles.offline]}>
        <Text style={styles.offlineTitle}>MAP NEEDS INTERNET</Text>
        <Text style={styles.offlineText}>
          No connection right now. Stand at the place and tap USE WHERE I AM instead.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.box}>
      <WebView
        ref={web}
        originWhitelist={['*']}
        source={{ html, baseUrl: 'https://github.com/akashkashyaps/nowomp' }}
        applicationNameForUserAgent="NoWomp/2.0"
        javaScriptEnabled
        onError={goOffline}
        onMessage={(e) => {
          try {
            const msg = JSON.parse(e.nativeEvent.data);
            if (msg.type === 'move') onMove(msg.lat, msg.lng);
            if (msg.type === 'offline') goOffline();
          } catch {}
        }}
        style={styles.web}
      />
      {/* The pin sits over the map's centre; its tip marks the point. */}
      <View pointerEvents="none" style={styles.pinWrap}>
        <Text style={styles.pin}>📍</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: {
    height: 300,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: colors.border,
    backgroundColor: colors.card,
  },
  web: { flex: 1, backgroundColor: colors.bg },
  pinWrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Lifted by half its height so the tip, not the middle, is on the centre.
  pin: { fontSize: 36, marginBottom: 36 },
  offline: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  offlineTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.warn },
  offlineText: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, textAlign: 'center', lineHeight: 19 },
});
