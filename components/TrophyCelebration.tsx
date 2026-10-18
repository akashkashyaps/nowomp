import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Modal, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { PixelBadge } from '@/components/PixelBadge';
import { AchievementService } from '@/services/AchievementService';
import type { AchievementDefinition } from '@/constants/achievements';
import { TROPHY_ART } from '@/constants/trophyArt';
import { colors, fonts } from '@/constants/theme';

const TIER_LABEL = {
  bronze: 'BRONZE',
  silver: 'SILVER',
  gold: 'GOLD',
  lab: 'LAB',
  shame: 'HALL OF SHAME',
} as const;

/** Sparkle positions around the badge, as offsets from its centre. */
const SPARKS = [
  [-96, -70], [92, -58], [-110, 20], [108, 34], [-60, 96], [70, 100], [0, -112],
];

/**
 * App-wide trophy unlock celebration. Listens for unlocks from
 * AchievementService and plays them one at a time: the silhouette flips over
 * to reveal the badge, it pops, the phone buzzes and sparkles burst out.
 */
export function TrophyCelebration() {
  const [queue, setQueue] = useState<AchievementDefinition[]>([]);
  const [revealed, setRevealed] = useState(false);
  const flip = useRef(new Animated.Value(0)).current;
  const pop = useRef(new Animated.Value(1)).current;
  const spark = useRef(new Animated.Value(0)).current;

  useEffect(
    () =>
      AchievementService.onUnlock((fresh) =>
        setQueue((q) => [...q, ...fresh.filter((f) => !q.some((x) => x.id === f.id))])
      ),
    []
  );

  const current = queue[0];

  useEffect(() => {
    if (!current) return;
    setRevealed(false);
    flip.setValue(0);
    pop.setValue(0.6);
    spark.setValue(0);
    Animated.sequence([
      Animated.spring(pop, { toValue: 1, friction: 6, useNativeDriver: true }),
      Animated.delay(250),
      Animated.timing(flip, { toValue: 0.5, duration: 220, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setRevealed(true);
      Haptics.notificationAsync(
        TROPHY_ART[current.id]?.tier === 'shame'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      );
      Animated.parallel([
        Animated.timing(flip, { toValue: 1, duration: 260, easing: Easing.out(Easing.back(2)), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(pop, { toValue: 1.15, duration: 140, useNativeDriver: true }),
          Animated.spring(pop, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]),
        Animated.timing(spark, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }, [current, flip, pop, spark]);

  if (!current) return null;

  const tier = TROPHY_ART[current.id]?.tier ?? 'bronze';
  const shame = tier === 'shame';
  const rotateY = flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '0deg'] });
  const next = () => setQueue((q) => q.slice(1));
  const skipAll = () => setQueue([]);

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={skipAll}>
      <View style={styles.backdrop}>
        <View style={styles.card}>
          <Text style={[styles.kicker, shame && { color: colors.danger }]}>
            {shame ? '💀 SHAME UNLOCKED' : '🏆 TROPHY UNLOCKED'}
          </Text>

          <View style={styles.stage}>
            {SPARKS.map(([dx, dy], i) => (
              <Animated.Text
                key={i}
                style={[
                  styles.spark,
                  {
                    opacity: spark.interpolate({ inputRange: [0, 0.2, 1], outputRange: [0, 1, 0] }),
                    transform: [
                      { translateX: spark.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                      { translateY: spark.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                    ],
                  },
                ]}
              >
                {shame ? '✖' : '✦'}
              </Animated.Text>
            ))}
            <Animated.View style={{ transform: [{ perspective: 600 }, { rotateY }, { scale: pop }] }}>
              <PixelBadge id={current.id} state={revealed ? 'unlocked' : 'locked'} size={176} />
            </Animated.View>
          </View>

          <Text style={[styles.tier, shame && { color: colors.danger }]}>{TIER_LABEL[tier]}</Text>
          <Text style={styles.title}>{current.title.toUpperCase()}</Text>
          <Text style={styles.desc}>{current.description}</Text>

          <View style={styles.buttons}>
            {queue.length > 1 && (
              <TouchableOpacity style={styles.secondary} onPress={skipAll}>
                <Text style={styles.secondaryText}>SKIP ALL</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={[styles.primary, shame && { backgroundColor: colors.danger }]} onPress={next}>
              <Text style={[styles.primaryText, shame && { color: colors.text }]}>
                {queue.length > 1 ? `NEXT (${queue.length - 1} MORE)` : shame ? 'UGH, FINE' : 'NICE'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    alignItems: 'center',
  },
  kicker: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    letterSpacing: 2,
    color: colors.accent,
  },
  stage: {
    width: 260,
    height: 240,
    alignItems: 'center',
    justifyContent: 'center',
  },
  spark: {
    position: 'absolute',
    fontSize: 22,
    color: colors.warn,
  },
  tier: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 2,
    color: colors.textDim,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
    marginTop: 4,
  },
  desc: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: 24,
  },
  buttons: {
    flexDirection: 'row',
    gap: 10,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 14,
  },
  primaryText: {
    fontFamily: fonts.heading,
    fontSize: 17,
    color: colors.bg,
  },
  secondary: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 18,
    paddingVertical: 14,
  },
  secondaryText: {
    fontFamily: fonts.bodyBold,
    fontSize: 13,
    color: colors.text,
  },
});
