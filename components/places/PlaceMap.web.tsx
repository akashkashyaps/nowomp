import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { buildHtml } from './placeMapHtml';
import { colors } from '@/constants/theme';

export interface PlaceMapHandle {
  moveTo(latitude: number, longitude: number, zoom?: number): void;
}

/** Web preview stand-in for the WebView map: the same page in an iframe. */
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
>(function PlaceMap({ latitude, longitude, zoom, radius, onMove }, ref) {
  const frame = useRef<HTMLIFrameElement>(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildHtml(latitude, longitude, zoom, radius), []);
  const run = (js: string) => (frame.current?.contentWindow as any)?.eval?.(js);

  useImperativeHandle(ref, () => ({
    moveTo(lat, lng, z) {
      run(`window.moveTo(${lat}, ${lng}, ${z ?? 'null'})`);
    },
  }));

  useEffect(() => {
    run(`window.setRadius && window.setRadius(${radius})`);
  }, [radius]);

  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.type === 'move') onMove(msg.lat, msg.lng);
      } catch {}
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [onMove]);

  return (
    <View style={styles.box}>
      <iframe ref={frame} srcDoc={html} style={{ border: 0, width: '100%', height: '100%' }} />
      <View pointerEvents="none" style={styles.pinWrap}>
        <Text style={styles.pin}>📍</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  box: { height: 300, borderRadius: 16, overflow: 'hidden', borderWidth: 2, borderColor: colors.border, backgroundColor: colors.card },
  pinWrap: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  pin: { fontSize: 36, marginBottom: 36 },
});
