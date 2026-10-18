import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ArrowLeft, ChevronDown, ChevronUp } from 'lucide-react-native';
import { HealthConnectService } from '@/services/HealthConnectService';
import { HealthProfileService } from '@/services/HealthProfileService';
import { HeartRateZoneChart } from '@/components/HeartRateZoneChart';
import { colors, fonts } from '@/constants/theme';

interface Session {
  /** Health Connect's own id — unique per session, unlike start_time, which two
   *  devices recording the same workout can share. */
  hc_record_id: string;
  exercise_name: string;
  title: string | null;
  local_date: string;
  start_time: string;
  end_time: string;
  duration_min: number;
  avg_heart_rate: number | null;
  max_heart_rate: number | null;
  calories: number | null;
  distance_km: number | null;
  steps: number | null;
  hr_samples: string | null;
  zone_minutes: number | null;
}

const formatWhen = (iso: string): string => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (same(d, today)) return `Today, ${time}`;
  if (same(d, yesterday)) return `Yesterday, ${time}`;
  return `${d.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  })}, ${time}`;
};

const formatDuration = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

type StatEntry = { label: string; value: string; unit?: string };

/**
 * The stats a session actually has, in reading order.
 *
 * Built per session rather than fixed, because what describes a workout depends
 * on the workout: a walk is steps and distance, a strength session is heart
 * rate and calories. Anything Health Connect didn't record is left out entirely
 * instead of shown as a placeholder dash.
 */
const statsFor = (s: Session): StatEntry[] => {
  const out: StatEntry[] = [];
  const num = (v: number) => Math.round(v).toLocaleString();

  if (s.avg_heart_rate != null) out.push({ label: 'AVG HR', value: num(s.avg_heart_rate), unit: 'bpm' });
  if (s.max_heart_rate != null) out.push({ label: 'MAX HR', value: num(s.max_heart_rate), unit: 'bpm' });
  if (s.zone_minutes != null && s.zone_minutes >= 0.5)
    out.push({ label: 'ZONE MIN', value: num(s.zone_minutes), unit: 'min' });
  if (s.calories != null) out.push({ label: 'CALORIES', value: num(s.calories), unit: 'kcal' });
  if (s.distance_km != null)
    out.push({ label: 'DISTANCE', value: s.distance_km.toFixed(2), unit: 'km' });
  if (s.steps != null) out.push({ label: 'STEPS', value: num(s.steps) });

  return out;
};

/** Chunk into rows of three so the flex columns stay even. */
const inRows = <T,>(items: T[], per = 3): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += per) rows.push(items.slice(i, i + per));
  return rows;
};

function Stat({ label, value, unit }: StatEntry) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>
        {value}
        {unit ? <Text style={styles.statUnit}> {unit}</Text> : null}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/**
 * Every recorded workout, with its heart rate trace.
 *
 * Kept off the Health tab deliberately: the trace is only meaningful per
 * workout, and a daily zone-minutes total said almost nothing useful.
 */
export default function WorkoutsScreen() {
  const insets = useSafeAreaInsets();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [maxHr, setMaxHr] = useState(190);
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      HealthConnectService.getRecentExerciseSessions(50)
        .then((s) => setSessions(s as Session[]))
        .catch(() => {});
      HealthProfileService.getProfile()
        .then((p) => setMaxHr(p.maxHr))
        .catch(() => {});
    }, [])
  );

  const chartWidth = Dimensions.get('window').width - 72;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <ArrowLeft size={22} color={colors.text} strokeWidth={2.5} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>WORKOUTS</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
        showsVerticalScrollIndicator={false}
      >
        {sessions.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyTitle}>NO WORKOUTS YET</Text>
            <Text style={styles.emptyBody}>
              Workouts recorded by your watch or phone appear here once they sync
              through Health Connect.
            </Text>
          </View>
        ) : (
          sessions.map((s) => {
            const isOpen = expanded === s.hc_record_id;
            return (
              <View key={s.hc_record_id} style={styles.card}>
                <TouchableOpacity
                  style={styles.cardHeader}
                  onPress={() => setExpanded(isOpen ? null : s.hc_record_id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.cardHeaderLeft}>
                    <Text style={styles.name}>{s.title || s.exercise_name}</Text>
                    <Text style={styles.when}>{formatWhen(s.start_time)}</Text>
                  </View>
                  <Text style={styles.duration}>{formatDuration(s.duration_min)}</Text>
                  {isOpen ? (
                    <ChevronUp size={16} color={colors.textFaint} strokeWidth={2.5} />
                  ) : (
                    <ChevronDown size={16} color={colors.textFaint} strokeWidth={2.5} />
                  )}
                </TouchableOpacity>

                {isOpen && (
                  <View style={styles.detail}>
                    {(() => {
                      const stats = statsFor(s);
                      if (stats.length === 0) {
                        return (
                          <Text style={styles.noStats}>
                            NO STATS RECORDED FOR THIS SESSION
                          </Text>
                        );
                      }
                      return inRows(stats).map((row, i) => (
                        <View key={i} style={styles.statRow}>
                          {row.map((st) => (
                            <Stat key={st.label} {...st} />
                          ))}
                          {/* Keep the last row's columns the same width as a
                              full row's, rather than stretching to fill. */}
                          {Array.from({ length: 3 - row.length }, (_, k) => (
                            <View key={`pad-${k}`} style={styles.stat} />
                          ))}
                        </View>
                      ));
                    })()}

                    <Text style={styles.chartTitle}>HEART RATE</Text>
                    <HeartRateZoneChart
                      samplesJson={s.hr_samples}
                      maxHr={maxHr}
                      width={chartWidth}
                    />
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: colors.card,
  },
  headerTitle: { fontFamily: fonts.heading, fontSize: 20, color: colors.text },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 16 },
  card: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    marginBottom: 12,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 16,
  },
  cardHeaderLeft: { flex: 1 },
  name: { fontFamily: fonts.bodyBold, fontSize: 14, color: colors.text },
  when: { fontFamily: fonts.body, fontSize: 10, color: colors.textFaint, marginTop: 2 },
  duration: { fontFamily: fonts.numeric, fontSize: 14, color: colors.accent },
  detail: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderTopColor: colors.bg,
    paddingTop: 14,
  },
  statRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  noStats: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  stat: { flex: 1 },
  statValue: { fontFamily: fonts.numericHeavy, fontSize: 16, color: colors.text },
  statUnit: { fontFamily: fonts.bodyBold, fontSize: 9, color: colors.textMuted },
  statLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.textFaint,
    letterSpacing: 0.5,
    marginTop: 2,
  },
  chartTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
    marginTop: 6,
    marginBottom: 8,
  },
  emptyCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 24,
    alignItems: 'center',
    gap: 10,
  },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.textMuted },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 18,
  },
});
