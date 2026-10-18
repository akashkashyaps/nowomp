import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';

import { colors } from '@/constants/theme';
/**
 * Pixel-square confetti in the app's colours. One burst flies out from a
 * point (the penguin) and arcs down under gravity, then a lighter rain falls
 * from the top. Every piece is animated on the native thread, so this costs
 * the JS thread nothing once started — unlike the old setInterval confetti
 * that re-rendered 100 views every 40ms.
 */

const COLORS = [colors.accent, '#FFD23F', colors.cyan, '#FF8A1F', colors.text, '#9085E9', colors.danger];

interface Piece {
  color: string;
  size: number;
  /** Start position. */
  x0: number;
  y0: number;
  /** Peak and landing offsets for the burst arc. */
  dx: number;
  peak: number;
  fall: number;
  spin: number;
  delay: number;
  duration: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

export function PixelConfetti({
  originX,
  originY,
  burst = 56,
  rain = 36,
}: {
  originX: number;
  originY: number;
  burst?: number;
  rain?: number;
}) {
  const { width, height } = useWindowDimensions();

  const pieces = useMemo<Piece[]>(() => {
    const out: Piece[] = [];
    for (let i = 0; i < burst; i++) {
      const angle = rand(-Math.PI * 0.95, -Math.PI * 0.05); // upward fan
      const power = rand(120, 300);
      out.push({
        color: pick(COLORS),
        size: pick([6, 8, 8, 10]),
        x0: originX,
        y0: originY,
        dx: Math.cos(angle) * power * 1.4,
        peak: Math.sin(angle) * power,
        fall: rand(height * 0.45, height * 0.8),
        spin: rand(-720, 720),
        delay: rand(0, 120),
        duration: rand(1700, 2600),
      });
    }
    for (let i = 0; i < rain; i++) {
      out.push({
        color: pick(COLORS),
        size: pick([6, 8]),
        x0: rand(0, width),
        y0: -20,
        dx: rand(-40, 40),
        peak: 0,
        fall: height + 40,
        spin: rand(-540, 540),
        delay: rand(500, 1800),
        duration: rand(2600, 3800),
      });
    }
    return out;
  }, [burst, rain, originX, originY, width, height]);

  const values = useRef(pieces.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anims = values.map((v, i) =>
      Animated.timing(v, {
        toValue: 1,
        duration: pieces[i].duration,
        delay: pieces[i].delay,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    Animated.parallel(anims).start();
    return () => anims.forEach((a) => a.stop());
  }, [values, pieces]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {pieces.map((p, i) => {
        const t = values[i];
        const isRain = p.peak === 0;
        // Burst: shoots up to its peak in the first ~30%, then falls (gravity).
        const translateY = isRain
          ? t.interpolate({ inputRange: [0, 1], outputRange: [0, p.fall] })
          : t.interpolate({
              inputRange: [0, 0.12, 0.28, 0.5, 1],
              outputRange: [0, p.peak * 0.75, p.peak, p.peak + p.fall * 0.3, p.peak + p.fall],
            });
        const translateX = t.interpolate({
          inputRange: [0, 0.3, 1],
          outputRange: [0, p.dx * 0.8, p.dx],
        });
        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                left: p.x0,
                top: p.y0,
                width: p.size,
                height: p.size,
                backgroundColor: p.color,
                opacity: t.interpolate({ inputRange: [0, 0.03, 0.8, 1], outputRange: [0, 1, 1, 0] }),
                transform: [
                  { translateX },
                  { translateY },
                  { rotate: t.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${p.spin}deg`] }) },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  // Square corners on purpose: pixel confetti to match the pixel art.
  piece: { position: 'absolute' },
});
