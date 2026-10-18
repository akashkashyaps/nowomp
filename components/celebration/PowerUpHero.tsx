import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import * as Haptics from 'expo-haptics';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import {
  composeCharging,
  composePowerUp,
  toPaths,
  POWER_BOLTS,
  POWER_FRAMES,
  POWER_H,
  POWER_W,
  PALETTE,
} from '@/constants/trophyArt';

const CHARGE_MS = 1150;
const FRAME_MS = 70;

const SPARKLE_DELAY_MS = 350;

/** Loads a sound up front so it starts with no delay; null if audio is unavailable. */
const loadSound = (source: number, volume: number): AudioPlayer | null => {
  try {
    const player = createAudioPlayer(source);
    player.volume = volume;
    return player;
  } catch {
    return null;
  }
};

const chargingPaths = toPaths(composeCharging());
const framePaths = Array.from({ length: POWER_FRAMES }, (_, i) => toPaths(composePowerUp(i)));

const Sprite = memo(function Sprite({ paths, width }: { paths: { color: string; d: string }[]; width: number }) {
  return (
    <Svg width={width} height={(width * POWER_H) / POWER_W} viewBox={`0 0 ${POWER_W} ${POWER_H}`}>
      {paths.map((p) => (
        <Path key={p.color} d={p.d} fill={p.color} />
      ))}
    </Svg>
  );
});

const Bolt = memo(function Bolt({ sprite, px }: { sprite: string[]; px: number }) {
  const d: { color: string; d: string }[] = useMemo(() => toPaths(sprite), [sprite]);
  return (
    <Svg width={sprite[0].length * px} height={sprite.length * px} viewBox={`0 0 ${sprite[0].length} ${sprite.length}`}>
      {d.map((p) => (
        <Path key={p.color} d={p.d} fill={p.color} />
      ))}
    </Svg>
  );
});

/**
 * A hard step for sprite frames. `v` runs 0 → n; frame i owns [i, i+1), and the
 * last frame also owns the end value, so no instant of the cycle is blank.
 */
const stepFor = (v: Animated.Value, i: number, n: number) => {
  if (i === 0) return v.interpolate({ inputRange: [0, 0.999, 1], outputRange: [1, 1, 0], extrapolate: 'clamp' });
  if (i === n - 1) return v.interpolate({ inputRange: [i - 0.001, i], outputRange: [0, 1], extrapolate: 'clamp' });
  return v.interpolate({
    inputRange: [i - 0.001, i, i + 0.999, i + 1],
    outputRange: [0, 1, 1, 0],
    extrapolate: 'clamp',
  });
};

/**
 * The power-up transformation for the workout-complete screen.
 *
 * Charge: he shakes harder and harder while energy specks are pulled into him
 * and a faint aura sputters, with a building rumble. Burst: `onBurst` fires
 * (the screen flashes and throws confetti) and he snaps into the powered form.
 * Powered: a full-body aura streams upward (four frames cycled fast), energy
 * rises past him and lightning snaps on and off. Everything is native-driven.
 */
export function PowerUpTransformation({ width = 220, onBurst }: { width?: number; onBurst?: () => void }) {
  const height = (width * POWER_H) / POWER_W;
  const px = width / POWER_W;
  const [powered, setPowered] = useState(false);

  const charge = useRef(new Animated.Value(0)).current;
  const jitter = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const cycle = useRef(new Animated.Value(0)).current;
  const float = useRef(new Animated.Value(0)).current;
  const rise = useRef(Array.from({ length: 14 }, () => new Animated.Value(0))).current;
  const bolts = useRef(POWER_BOLTS.map(() => new Animated.Value(0))).current;
  const specks = useRef(Array.from({ length: 12 }, () => new Animated.Value(0))).current;

  // Random but stable layouts for specks (inward) and rising energy (upward).
  const speckLayout = useMemo(
    () => specks.map((_, i) => ({ angle: (i / specks.length) * Math.PI * 2 + Math.random() * 0.4, dist: width * (0.7 + Math.random() * 0.3) })),
    [specks, width]
  );
  const riseLayout = useMemo(
    () => rise.map(() => ({ x: width * (0.2 + Math.random() * 0.6), size: Math.random() < 0.5 ? px : px * 1.5 })),
    [rise, width, px]
  );

  useEffect(() => {
    const running: Animated.CompositeAnimation[] = [];
    const timers: ReturnType<typeof setTimeout>[] = [];

    // The three 8-bit cues are timed to the animation: the charge sound runs
    // with the shake, the burst lands on the flash, the sparkle on the stars.
    const sounds = {
      charge: loadSound(require('@/assets/sounds/powerup-charge.wav'), 0.65),
      burst: loadSound(require('@/assets/sounds/powerup-burst.wav'), 1),
      sparkle: loadSound(require('@/assets/sounds/powerup-sparkle.wav'), 0.5),
    };
    sounds.charge?.play();

    // --- charge
    const shake = Animated.loop(
      Animated.sequence([
        Animated.timing(jitter, { toValue: 1, duration: 35, useNativeDriver: true }),
        Animated.timing(jitter, { toValue: -1, duration: 70, useNativeDriver: true }),
        Animated.timing(jitter, { toValue: 0, duration: 35, useNativeDriver: true }),
      ])
    );
    shake.start();
    running.push(shake);
    Animated.timing(charge, { toValue: 1, duration: CHARGE_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start();
    Animated.stagger(
      70,
      specks.map((v) => Animated.timing(v, { toValue: 1, duration: 420, easing: Easing.in(Easing.cubic), useNativeDriver: true }))
    ).start();
    // A rumble that builds.
    [0, 260, 480, 660, 800, 920, 1020, 1100].forEach((t) =>
      timers.push(setTimeout(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light), t))
    );

    // --- burst
    timers.push(
      setTimeout(() => {
        shake.stop();
        jitter.setValue(0);
        setPowered(true);
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        sounds.burst?.play();
        timers.push(setTimeout(() => sounds.sparkle?.play(), SPARKLE_DELAY_MS));
        onBurst?.();
        pop.setValue(1.3);
        Animated.spring(pop, { toValue: 1, friction: 3, tension: 90, useNativeDriver: true }).start();

        // --- powered loops
        const loops = [
          Animated.loop(Animated.timing(cycle, { toValue: POWER_FRAMES, duration: FRAME_MS * POWER_FRAMES, easing: Easing.linear, useNativeDriver: true })),
          Animated.loop(
            Animated.sequence([
              Animated.timing(float, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
              Animated.timing(float, { toValue: 0, duration: 1000, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
          ),
          ...rise.map((v, i) =>
            Animated.loop(
              Animated.sequence([
                Animated.delay((i * 97) % 700),
                Animated.timing(v, { toValue: 1, duration: 650 + ((i * 53) % 350), easing: Easing.out(Easing.quad), useNativeDriver: true }),
                Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
              ])
            )
          ),
          ...bolts.map((v, i) =>
            Animated.loop(
              Animated.sequence([
                Animated.delay(150 + ((i * 211) % 600)),
                Animated.timing(v, { toValue: 1, duration: 0, useNativeDriver: true }),
                Animated.delay(60),
                Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
                Animated.delay(50),
                Animated.timing(v, { toValue: 1, duration: 0, useNativeDriver: true }),
                Animated.delay(90),
                Animated.timing(v, { toValue: 0, duration: 0, useNativeDriver: true }),
                Animated.delay(500 + ((i * 137) % 700)),
              ])
            )
          ),
        ];
        loops.forEach((l) => l.start());
        running.push(...loops);
      }, CHARGE_MS)
    );

    return () => {
      timers.forEach(clearTimeout);
      running.forEach((a) => a.stop());
      Object.values(sounds).forEach((s) => s?.remove());
    };
    // Runs once per mount: the transformation is a one-shot sequence.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shakeX = Animated.multiply(jitter, charge.interpolate({ inputRange: [0, 1], outputRange: [0.5, 7] }));

  return (
    <Animated.View
      style={{
        width,
        height,
        transform: [
          { translateX: shakeX },
          { translateY: float.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
          { scale: pop },
        ],
      }}
    >
      {!powered && (
        <>
          {/* A faint aura sputters on as the charge builds. */}
          <Animated.View
            style={[
              StyleSheet.absoluteFill,
              { opacity: Animated.multiply(charge, jitter.interpolate({ inputRange: [-1, 0, 1], outputRange: [0.15, 0.55, 0.15] })) },
            ]}
          >
            <Sprite paths={framePaths[0]} width={width} />
          </Animated.View>
          <View style={StyleSheet.absoluteFill}>
            <Sprite paths={chargingPaths} width={width} />
          </View>
          {specks.map((v, i) => {
            const { angle, dist } = speckLayout[i];
            return (
              <Animated.View
                key={i}
                style={[
                  styles.speck,
                  {
                    left: width / 2,
                    top: height * 0.62,
                    width: px * 1.5,
                    height: px * 1.5,
                    opacity: v.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0.2] }),
                    transform: [
                      { translateX: v.interpolate({ inputRange: [0, 1], outputRange: [Math.cos(angle) * dist, 0] }) },
                      { translateY: v.interpolate({ inputRange: [0, 1], outputRange: [Math.sin(angle) * dist, 0] }) },
                    ],
                  },
                ]}
              />
            );
          })}
        </>
      )}

      {powered && (
        <>
          {framePaths.map((paths, i) => (
            <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: stepFor(cycle, i, POWER_FRAMES) }]}>
              <Sprite paths={paths} width={width} />
            </Animated.View>
          ))}
          {rise.map((v, i) => (
            <Animated.View
              key={i}
              style={[
                styles.mote,
                {
                  left: riseLayout[i].x,
                  top: height * 0.85,
                  width: riseLayout[i].size,
                  height: riseLayout[i].size,
                  opacity: v.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 0.8, 0] }),
                  transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [0, -height * 0.85] }) }],
                },
              ]}
            />
          ))}
          {POWER_BOLTS.map((b, i) => (
            <Animated.View key={i} style={{ position: 'absolute', left: b.x * px, top: b.y * px, opacity: bolts[i] }}>
              <Bolt sprite={b.sprite} px={px} />
            </Animated.View>
          ))}
        </>
      )}
    </Animated.View>
  );
}

/** Expanding shockwave ring for the moment of the burst. */
export function Shockwave({ size, delay = 0 }: { size: number; delay?: number }) {
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: 800, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [t, delay]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          marginLeft: -size / 2,
          marginTop: -size / 2,
          opacity: t.interpolate({ inputRange: [0, 0.1, 1], outputRange: [0, 0.9, 0] }),
          transform: [{ scale: t.interpolate({ inputRange: [0, 1], outputRange: [0.3, 3] }) }],
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  speck: { position: 'absolute', backgroundColor: PALETTE['$'] },
  mote: { position: 'absolute', backgroundColor: PALETTE['%'] },
  ring: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    borderWidth: 4,
    borderColor: '#FFE45C',
  },
});
