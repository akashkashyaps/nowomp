import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { UserService } from '@/services/UserService';
import { WorkoutService } from '@/services/WorkoutService';
import { AchievementService } from '@/services/AchievementService';
import { PowerUpTransformation, Shockwave } from '@/components/celebration/PowerUpHero';
import { PixelConfetti } from '@/components/celebration/PixelConfetti';
import { colors, fonts } from '@/constants/theme';

/** Streak lengths worth calling out. */
const STREAK_MILESTONES = [7, 14, 30, 50, 100, 150, 200, 365];
const TITLES = ['POWERED UP', 'BEAST MODE', 'NO WOMP TODAY', 'ABSOLUTE UNIT', 'DIFFERENT BREED'];
const HERO_WIDTH = 230;

const fmtClock = (secs: number) => {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
};

/**
 * Workout complete. The transformation is the moment; underneath, only what's
 * worth knowing right now — the time, and one slim row of three numbers.
 * Rare events (milestone, freeze token, journey) get a single pill.
 */
export default function WorkoutSuccessScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { duration, freezeTokenEarned, journeyName, streak } = useLocalSearchParams<{
    duration?: string;
    freezeTokenEarned?: string;
    journeyName?: string;
    streak?: string;
  }>();
  const seconds = duration ? parseInt(duration, 10) || 0 : 0;
  const streakCount = streak ? parseInt(streak, 10) || 0 : 0;
  const [title] = useState(() => TITLES[Math.floor(Math.random() * TITLES.length)]);
  const [burst, setBurst] = useState(false);
  const [isBest, setIsBest] = useState(false);
  const [week, setWeek] = useState<number | null>(null);
  // This session against your average, in whole minutes.
  const [vsAvg, setVsAvg] = useState<number | null>(null);
  const [clockText, setClockText] = useState(fmtClock(0));
  // Where the penguin actually sits, so the confetti bursts out of him.
  const [heroY, setHeroY] = useState<number | null>(null);

  const flash = useRef(new Animated.Value(0)).current;
  const reveal = useRef(new Animated.Value(0)).current;
  const clock = useRef(new Animated.Value(0)).current;

  // One rare-event pill, most important first.
  const pill = STREAK_MILESTONES.includes(streakCount)
    ? `🔥 ${streakCount}-WORKOUT MILESTONE`
    : freezeTokenEarned === '1'
      ? '❄️ FREEZE TOKEN EARNED'
      : journeyName
        ? `🏁 JOURNEY COMPLETE: ${journeyName.toUpperCase()}`
        : null;

  useEffect(() => {
    UserService.getHighestStreak()
      .then((best) => setIsBest(streakCount > 1 && streakCount >= best))
      .catch(() => {});
    WorkoutService.getThisWeekWorkouts().then(setWeek).catch(() => {});
    WorkoutService.getAverageGymDuration()
      .then((avg) => setVsAvg(avg > 0 && seconds > 0 ? Math.round((seconds - avg) / 60) : null))
      .catch(() => {});
    const id = clock.addListener(({ value }) => setClockText(fmtClock(value)));
    return () => clock.removeListener(id);
  }, [clock, streakCount, seconds]);

  const onBurst = () => {
    setBurst(true);
    flash.setValue(1);
    Animated.timing(flash, { toValue: 0, duration: 500, easing: Easing.out(Easing.quad), useNativeDriver: true }).start();
    Animated.timing(reveal, { toValue: 1, duration: 420, delay: 120, easing: Easing.out(Easing.back(1.6)), useNativeDriver: true }).start();
    Animated.timing(clock, { toValue: seconds, duration: 1000, delay: 250, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    // Trophies earned by this workout pop up once the dust settles.
    setTimeout(() => AchievementService.evaluate(), 1800);
  };

  const handleContinue = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.replace('/(tabs)');
  };

  const fadeUp = (delay: number) => ({
    opacity: reveal.interpolate({ inputRange: [0, delay, 1], outputRange: [0, 0, 1] }),
    transform: [{ translateY: reveal.interpolate({ inputRange: [0, 1], outputRange: [18, 0] }) }],
  });

  return (
    <View style={styles.container}>
      <View style={[styles.top, { paddingTop: insets.top + 16 }]}>
        <View style={styles.hero} onLayout={(e) => setHeroY(e.nativeEvent.layout.y + e.nativeEvent.layout.height * 0.6)}>
          {burst && (
            <>
              <Shockwave size={200} />
              <Shockwave size={200} delay={160} />
            </>
          )}
          <PowerUpTransformation width={HERO_WIDTH} onBurst={onBurst} />
        </View>

        <Animated.Text style={[styles.title, fadeUp(0), { transform: [{ scale: reveal.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) }] }]}>
          {title}
        </Animated.Text>
        <Animated.View style={[styles.durationBox, fadeUp(0.2)]}>
          <Text style={styles.duration}>{clockText}</Text>
          <Text style={styles.durationLabel}>DURATION</Text>
        </Animated.View>

        {/* One slim row, three numbers. */}
        <Animated.View style={[styles.stats, fadeUp(0.4)]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.accent }]}>{streakCount}</Text>
            <Text style={styles.statLabel}>STREAK</Text>
            {isBest && <Text style={styles.best}>NEW BEST</Text>}
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>{week ?? '–'}</Text>
            <Text style={styles.statLabel}>THIS WEEK</Text>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <Text style={styles.statValue}>
              {vsAvg == null ? '–' : `${vsAvg > 0 ? '+' : vsAvg < 0 ? '−' : ''}${Math.abs(vsAvg)}m`}
            </Text>
            <Text style={styles.statLabel}>VS AVERAGE</Text>
          </View>
        </Animated.View>
        {pill && (
          <Animated.View style={[styles.pill, fadeUp(0.6)]}>
            <Text style={styles.pillText} numberOfLines={1}>
              {pill}
            </Text>
          </Animated.View>
        )}
      </View>

      <Animated.View style={[styles.bottom, { paddingBottom: insets.bottom + 24 }, fadeUp(0.7)]}>
        <TouchableOpacity style={styles.cta} onPress={handleContinue} activeOpacity={0.85} disabled={!burst}>
          <Text style={styles.ctaText}>PROCEED PROUDLY</Text>
        </TouchableOpacity>
      </Animated.View>

      {burst && <PixelConfetti originX={width / 2} originY={heroY ?? insets.top + HERO_WIDTH} />}

      {/* The burst flash: white-gold, gone in half a second. */}
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flash, { opacity: flash }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  top: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  hero: { alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
  title: { fontFamily: fonts.heading, fontSize: 44, color: colors.text, textAlign: 'center' },
  durationBox: { alignItems: 'center', marginTop: 4 },
  duration: { fontFamily: fonts.numericHeavy, fontSize: 40, color: colors.text },
  durationLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 2, color: colors.textDim, marginTop: 2 },
  stats: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginTop: 22,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    width: '100%',
    maxWidth: 360,
  },
  stat: { flex: 1, alignItems: 'center' },
  statValue: { fontFamily: fonts.numericHeavy, fontSize: 22, color: colors.text },
  statLabel: { fontFamily: fonts.bodyBold, fontSize: 10, letterSpacing: 1, color: colors.textMuted, marginTop: 4 },
  best: { fontFamily: fonts.bodyBold, fontSize: 9, letterSpacing: 1, color: colors.warn, marginTop: 3 },
  divider: { width: 1, backgroundColor: colors.border, marginVertical: 2 },
  pill: {
    marginTop: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.warn,
    backgroundColor: 'rgba(255, 201, 62, 0.12)',
    maxWidth: '100%',
  },
  pillText: { fontFamily: fonts.bodyBold, fontSize: 12, letterSpacing: 1, color: colors.warn },
  bottom: { paddingHorizontal: 24 },
  cta: { backgroundColor: colors.accent, paddingVertical: 17, borderRadius: 14, alignItems: 'center' },
  ctaText: { fontFamily: fonts.heading, fontSize: 19, color: colors.bg },
  flash: { backgroundColor: '#FFF6C2' },
});
