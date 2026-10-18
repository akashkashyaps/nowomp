import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, useWindowDimensions } from 'react-native';
import { PALETTE } from '@/constants/trophyArt';

/**
 * Pixel-art energy sparks for the power-up. Same palette as the aura (gold,
 * pale gold, amber) with a few cyan lightning flecks, and pixel shapes —
 * squares, embers and "+" stars — that never rotate, so they stay on the
 * pixel grid like the art. A burst flies out of the penguin and falls under
 * gravity; stars twinkle around him afterwards. All native-driven.
 */

const GOLD = [PALETTE['%'], PALETTE['$'], PALETTE['&'], PALETTE.Y];
const FLECK = PALETTE['@'];

type Shape = 'square' | 'ember' | 'plus';

interface Spark {
  shape: Shape;
  color: string;
  px: number;
  dx: number;
  peak: number;
  fall: number;
  delay: number;
  duration: number;
}

interface Twinkle {
  x: number;
  y: number;
  px: number;
  color: string;
  delay: number;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)];

/** A pixel shape built from Views: one square, a 1x2 ember, or a 3x3 "+". */
function PixelShape({ shape, px, color }: { shape: Shape; px: number; color: string }) {
  if (shape === 'square') return <View style={{ width: px, height: px, backgroundColor: color }} />;
  if (shape === 'ember') return <View style={{ width: px, height: px * 2, backgroundColor: color }} />;
  return (
    <View style={{ width: px * 3, height: px * 3 }}>
      <View style={{ position: 'absolute', left: px, top: 0, width: px, height: px * 3, backgroundColor: color }} />
      <View style={{ position: 'absolute', left: 0, top: px, width: px * 3, height: px, backgroundColor: color }} />
    </View>
  );
}

export function PixelConfetti({
  originX,
  originY,
  burst = 44,
  twinkles = 10,
}: {
  originX: number;
  originY: number;
  burst?: number;
  twinkles?: number;
}) {
  const { width, height } = useWindowDimensions();

  const sparks = useMemo<Spark[]>(
    () =>
      Array.from({ length: burst }, () => {
        const angle = rand(-Math.PI * 0.97, -Math.PI * 0.03); // an upward fan
        const power = rand(110, 280);
        const fleck = Math.random() < 0.12;
        return {
          shape: fleck ? 'ember' : pick<Shape>(['square', 'square', 'ember', 'plus']),
          color: fleck ? FLECK : pick(GOLD),
          px: pick([3, 4, 4, 5]),
          dx: Math.cos(angle) * power * 1.3,
          peak: Math.sin(angle) * power,
          fall: rand(height * 0.35, height * 0.7),
          delay: rand(0, 90),
          duration: rand(1500, 2400),
        };
      }),
    [burst, height]
  );

  const stars = useMemo<Twinkle[]>(
    () =>
      Array.from({ length: twinkles }, () => ({
        x: originX + rand(-width * 0.42, width * 0.42),
        y: originY + rand(-170, 60),
        px: pick([3, 4]),
        color: pick([PALETTE['%'], PALETTE['$'], '#FFFFFF']),
        delay: rand(300, 2200),
      })),
    [twinkles, originX, originY, width]
  );

  const sparkValues = useRef(sparks.map(() => new Animated.Value(0))).current;
  const starValues = useRef(stars.map(() => new Animated.Value(0))).current;

  useEffect(() => {
    const anims = [
      ...sparkValues.map((v, i) =>
        Animated.timing(v, {
          toValue: 1,
          duration: sparks[i].duration,
          delay: sparks[i].delay,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ),
      ...starValues.map((v, i) =>
        Animated.loop(
          Animated.sequence([
            Animated.delay(stars[i].delay),
            Animated.timing(v, { toValue: 1, duration: 260, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.timing(v, { toValue: 0, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
            Animated.delay(900),
          ]),
          { iterations: 3 }
        )
      ),
    ];
    anims.forEach((a) => a.start());
    return () => anims.forEach((a) => a.stop());
  }, [sparkValues, starValues, sparks, stars]);

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {sparks.map((p, i) => {
        const t = sparkValues[i];
        return (
          <Animated.View
            key={`s${i}`}
            style={{
              position: 'absolute',
              left: originX,
              top: originY,
              opacity: t.interpolate({ inputRange: [0, 0.03, 0.75, 1], outputRange: [0, 1, 1, 0] }),
              transform: [
                { translateX: t.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, p.dx * 0.8, p.dx] }) },
                {
                  // Up to the peak fast, then a gravity fall.
                  translateY: t.interpolate({
                    inputRange: [0, 0.12, 0.28, 0.5, 1],
                    outputRange: [0, p.peak * 0.75, p.peak, p.peak + p.fall * 0.3, p.peak + p.fall],
                  }),
                },
              ],
            }}
          >
            <PixelShape shape={p.shape} px={p.px} color={p.color} />
          </Animated.View>
        );
      })}
      {stars.map((s, i) => (
        <Animated.View
          key={`t${i}`}
          style={{
            position: 'absolute',
            left: s.x,
            top: s.y,
            opacity: starValues[i],
            transform: [{ scale: starValues[i].interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }],
          }}
        >
          <PixelShape shape="plus" px={s.px} color={s.color} />
        </Animated.View>
      ))}
    </View>
  );
}
