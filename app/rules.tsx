import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, LayoutAnimation, Platform, UIManager } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ChevronDown } from 'lucide-react-native';
import { ScreenHeader } from '@/components/ScreenHeader';
import { PixelBadge } from '@/components/PixelBadge';
import { colors, fonts } from '@/constants/theme';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * "How NoWomp works": the full rules, as a reference rather than an onboarding
 * wall. Short summary up top; each system is a collapsible section with its
 * trophy art. Numbers here mirror the services (FreezeTokenService,
 * RedemptionWorkoutService, LocationService, ExcuseSubmissionService) — change
 * them together.
 */

interface Section {
  id: string;
  art: string;
  title: string;
  summary: string;
  points: string[];
}

const QUICK_RULES = [
  'Schedule workouts. Only scheduled days count.',
  'Start and end them at your gym or home. Your location is checked.',
  "Can't go? Make an excuse before you skip. Missed ones must be explained.",
  'Freeze tokens and redemption can save your streak, but never grow it.',
  'The Lab checks your excuses against your own body data.',
];

const SECTIONS: Section[] = [
  {
    id: 'workouts',
    art: 'first_rep',
    title: 'WORKOUTS',
    summary: 'Scheduled, location-verified, timed.',
    points: [
      'Schedule workouts with the 📅 button on Today or in You → Plan workouts.',
      'Tap START WORKOUT when you arrive. You must be within about 200 m of your saved gym or home location.',
      'Tap END WORKOUT when you finish. The session is timed and saved as verified.',
      'One workout per day. Once you have made an excuse for a day, you can no longer work out that day.',
    ],
  },
  {
    id: 'streak',
    art: 'on_fire',
    title: 'STREAK',
    summary: 'Every verified workout adds one.',
    points: [
      'Your streak counts verified workouts since your last break.',
      'It breaks when a scheduled workout passes with no workout and no excuse, or when a redemption fails.',
      'Days with nothing scheduled never hurt your streak. Rest days are free.',
      'Your best ever streak is kept in You.',
    ],
  },
  {
    id: 'excuses',
    art: 'receipts',
    title: 'EXCUSES',
    summary: 'Skip honestly, before the workout if you can.',
    points: [
      'MAKE EXCUSE on Today, on a day with a workout scheduled. One excuse per day.',
      "You'll be shown a reason to go anyway first. You can still keep the excuse.",
      'Missed a workout without saying anything? Next time you open the app it asks why, before you can do anything else.',
      'An excuse for a missed workout must be given within 24 hours.',
      'Every excuse uses a freeze token if you have one. Otherwise it starts redemption.',
    ],
  },
  {
    id: 'freeze',
    art: 'ice_cold',
    title: 'FREEZE TOKENS',
    summary: 'Earned every 15-workout streak; protect it once.',
    points: [
      'You earn 1 token each time your streak reaches a multiple of 15.',
      'You can hold up to 5. Each expires 45 days after you earn it.',
      "When you make an excuse, a token is used automatically. Your streak is protected but doesn't grow.",
    ],
  },
  {
    id: 'redemption',
    art: 'redeemed',
    title: 'REDEMPTION',
    summary: 'No token? Earn your streak back.',
    points: [
      'If you have a workout scheduled in the next 48 hours, complete it on time.',
      'If not, you get 48 hours, starting tomorrow, to do any workout.',
      "A redemption workout saves your streak but doesn't add to it.",
      "No excuses while a redemption is active. Finish it first.",
      'Available once every 7 days. If you fail it, or have used it this week, your streak resets.',
    ],
  },
  {
    id: 'lab',
    art: 'weak_spot_slayer',
    title: 'THE LAB',
    summary: 'Your excuses, fact-checked.',
    points: [
      'Tired, sore, busy, anxious and sick excuses are checked against your sleep, recovery, steps, heart rate and journal.',
      'Verdicts: ✅ Backed by data, 🤨 Your body disagrees, 🤷 Inconclusive. Anxiety, sickness and emergencies are never marked as disputed.',
      'Patterns (weak weekday, weak time, sleep before skips) appear after 3 excuses.',
      'Everything runs on your phone. Nothing is sent anywhere.',
    ],
  },
  {
    id: 'experiments',
    art: 'scientist',
    title: 'EXPERIMENTS',
    summary: '4 weeks: rule on, off, on, off.',
    points: [
      'Pick one from the library (or design your own) in Lab → Experiments. One at a time.',
      'It starts tomorrow. The app randomly picks whether week 1 is rule on or rule off.',
      'Your main measure is locked when you start, and results stay hidden until the end.',
      'Check in every day. Only days you followed the plan count, and under 70% the result is unreliable.',
      'Quitting early is allowed. The Lab will remember. 🐀',
    ],
  },
  {
    id: 'trophies',
    art: 'legend',
    title: 'TROPHIES',
    summary: 'Bronze, silver, gold, Lab and Hall of Shame.',
    points: [
      'Earned automatically: streaks, consistency, honesty, health, journeys and experiments.',
      'Locked trophies show a silhouette and a progress bar. Hall of Shame trophies stay hidden until you earn them.',
      "Once earned, a trophy is yours forever, even if your streak breaks later.",
    ],
  },
  {
    id: 'health',
    art: 'well_rested',
    title: 'HEALTH',
    summary: 'Your watch data via Health Connect.',
    points: [
      'Sleep, recovery, HRV, resting heart rate and steps sync from Health Connect when you open the Health tab.',
      'Recovery scores need about 7 days of data to learn your normal.',
      'The daily journal (stress, caffeine, alcohol, meals) powers the Lab and experiments.',
    ],
  },
];

export default function RulesScreen() {
  const insets = useSafeAreaInsets();
  const { section } = useLocalSearchParams<{ section?: string }>();
  const [open, setOpen] = useState<Set<string>>(new Set(section ? [section] : []));
  const scrollRef = useRef<ScrollView>(null);
  const offsets = useRef(new Map<string, number>());

  // Deep link to a section (e.g. tapping the redemption banner on Today).
  useEffect(() => {
    if (!section) return;
    const t = setTimeout(() => {
      const y = offsets.current.get(section);
      if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - 12), animated: true });
    }, 250);
    return () => clearTimeout(t);
  }, [section]);

  const toggle = (id: string) => {
    Haptics.selectionAsync();
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <View style={styles.container}>
      <ScreenHeader title="HOW IT WORKS" />
      <ScrollView
        ref={scrollRef}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.quick}>
          <Text style={styles.quickTitle}>THE SHORT VERSION</Text>
          {QUICK_RULES.map((r, i) => (
            <View key={i} style={styles.quickRow}>
              <Text style={styles.quickNum}>{i + 1}</Text>
              <Text style={styles.quickText}>{r}</Text>
            </View>
          ))}
        </View>

        {SECTIONS.map((s) => {
          const isOpen = open.has(s.id);
          return (
            <View
              key={s.id}
              style={[styles.section, isOpen && styles.sectionOpen]}
              onLayout={(e) => offsets.current.set(s.id, e.nativeEvent.layout.y)}
            >
              <TouchableOpacity style={styles.head} onPress={() => toggle(s.id)} activeOpacity={0.7}>
                <PixelBadge id={s.art} size={48} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.title}>{s.title}</Text>
                  <Text style={styles.summary}>{s.summary}</Text>
                </View>
                <View style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }}>
                  <ChevronDown size={20} color={colors.textDim} />
                </View>
              </TouchableOpacity>
              {isOpen && (
                <View style={styles.points}>
                  {s.points.map((p, i) => (
                    <View key={i} style={styles.point}>
                      <View style={styles.bullet} />
                      <Text style={styles.pointText}>{p}</Text>
                    </View>
                  ))}
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  quick: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    gap: 10,
  },
  quickTitle: { fontFamily: fonts.bodyBold, fontSize: 11, letterSpacing: 1, color: colors.accent },
  quickRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  quickNum: {
    fontFamily: fonts.numeric,
    fontSize: 13,
    color: colors.bg,
    backgroundColor: colors.accent,
    width: 22,
    height: 22,
    borderRadius: 11,
    textAlign: 'center',
    lineHeight: 22,
    overflow: 'hidden',
  },
  quickText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.text },
  section: {
    backgroundColor: colors.card,
    borderRadius: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  sectionOpen: { borderColor: '#4a4a4a' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 },
  title: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  summary: { fontFamily: fonts.body, fontSize: 13, color: colors.textMuted, marginTop: 1 },
  points: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 2, gap: 10 },
  point: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  bullet: { width: 6, height: 6, borderRadius: 1, backgroundColor: colors.accent, marginTop: 7 },
  pointText: { flex: 1, fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textMuted },
});
