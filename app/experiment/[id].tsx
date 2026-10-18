import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ScreenHeader';
import Clipboard from '@react-native-clipboard/clipboard';
import { buildResultsPrompt } from '@/services/ExperimentAIBridge';
import {
  PhaseStrip,
  experimentEmoji,
  VERDICT_LABELS,
} from '@/components/ExperimentCard';
import {
  ExperimentService,
  type Experiment,
  type MetricResult,
} from '@/services/ExperimentService';
import { AchievementService } from '@/services/AchievementService';
import { addDays, formatMinutes } from '@/services/LabService';
import {
  BLOCK_DAYS,
  EXPERIMENT_DAYS,
  METRICS,
  MIN_COMPLIANCE,
  type MetricId,
} from '@/constants/experiments';
import { colors, fonts, chartColors } from '@/constants/theme';
import { getTodayLocal, parseLocalDateString } from '@/utils/dateUtils';

const ON_COLOR = chartColors.blue;
const OFF_COLOR = chartColors.orange;

const formatValue = (
  metric: MetricId,
  v: number | null,
  signed = false,
): string => {
  if (v == null) return '–';
  const sign = signed && v > 0 ? '+' : signed && v < 0 ? '−' : '';
  const a = signed ? Math.abs(v) : v;
  switch (METRICS[metric].unit) {
    case 'min':
      return sign + formatMinutes(a);
    case '%':
      return `${sign}${Math.round(a)}%`;
    case 'steps':
      return sign + Math.round(a).toLocaleString();
    case '/5':
      return `${sign}${a.toFixed(1)}/5`;
    default:
      return `${sign}${a.toFixed(1)} ${METRICS[metric].unit}`;
  }
};

const formatDate = (d: string) =>
  parseLocalDateString(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });

export default function ExperimentDetailScreen() {
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [exp, setExp] = useState<Experiment | null | undefined>(undefined);
  const [checkins, setCheckins] = useState<Map<string, boolean>>(new Map());

  const load = useCallback(async () => {
    try {
      const e = await ExperimentService.get(Number(id));
      setExp(e);
      if (e) setCheckins(await ExperimentService.getCheckins(e.id));
    } catch (error) {
      console.error('Error loading experiment:', error);
      setExp(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const abandon = () => {
    if (!exp) return;
    Alert.alert(
      'Abandon the experiment?',
      'Everything so far is thrown away, no result is calculated, and the Lab will remember this.',
      [
        { text: 'Keep going', style: 'cancel' },
        {
          text: 'Abandon',
          style: 'destructive',
          onPress: async () => {
            await ExperimentService.abandon(exp);
            // The Lab Rat Escaped trophy is announced by the celebration overlay.
            AchievementService.evaluate();
            Alert.alert('🐀 The lab rat escaped', 'Experiment abandoned.', [
              { text: 'OK', onPress: () => router.back() },
            ]);
          },
        },
      ],
    );
  };

  if (exp === undefined) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="EXPERIMENT" />
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      </View>
    );
  }
  if (exp === null) {
    return (
      <View style={styles.container}>
        <ScreenHeader title="EXPERIMENT" />
        <Text style={styles.missing}>Experiment not found.</Text>
      </View>
    );
  }

  const today = getTodayLocal();
  const result = exp.result;
  const status =
    exp.status === 'active'
      ? today < exp.start_date
        ? 'STARTS TOMORROW'
        : 'RUNNING'
      : exp.status === 'completed'
        ? 'COMPLETED'
        : 'ABANDONED';

  return (
    <View style={styles.container}>
      <ScreenHeader title="EXPERIMENT" />
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingBottom: insets.bottom + 32,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.head}>
          <Text style={styles.emoji}>{experimentEmoji(exp)}</Text>
          <Text style={styles.title}>{exp.title}</Text>
          <Text
            style={[
              styles.status,
              exp.status === 'abandoned' && { color: colors.danger },
            ]}
          >
            {status}
          </Text>
          <Text style={styles.dates}>
            {formatDate(exp.start_date)} – {formatDate(exp.endDate)}
          </Text>
        </View>

        <View style={styles.card}>
          <Text style={styles.hypothesis}>“{exp.hypothesis}”</Text>
          <View style={styles.ruleBox}>
            <Text style={styles.ruleOnLabel}>RULE ON</Text>
            <Text style={styles.ruleText}>{exp.rule}</Text>
          </View>
          <View style={[styles.ruleBox, styles.ruleBoxOff]}>
            <Text style={styles.ruleOffLabel}>RULE OFF</Text>
            <Text style={styles.ruleText}>{exp.off_rule}</Text>
          </View>
          <PhaseStrip
            exp={exp}
            today={exp.status === 'active' ? today : undefined}
          />
          <Text style={styles.metaLine}>
            Main measure:{' '}
            <Text style={styles.metaBold}>
              {METRICS[exp.primary_metric].label}
            </Text>
            {exp.secondary_metrics.length > 0 &&
              ` · also ${exp.secondary_metrics.map((m) => METRICS[m].label.toLowerCase()).join(', ')}`}
          </Text>
        </View>

        {exp.status === 'completed' && result && (
          <>
            <Text style={styles.sectionTitle}>RESULT</Text>
            <PrimaryResult r={result.primary} schedule={exp.schedule} />

            {result.secondary.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.cardLabel}>ALSO TRACKED</Text>
                {result.secondary.map((r) => {
                  const v = VERDICT_LABELS[r.verdict];
                  return (
                    <View key={r.metric} style={styles.secRow}>
                      <Text style={styles.secMetric}>
                        {METRICS[r.metric].label}
                      </Text>
                      <Text style={styles.secDiff}>
                        {formatValue(r.metric, r.diff, true)}
                      </Text>
                      <Text style={[styles.secVerdict, { color: v.color }]}>
                        {v.icon} {v.label}
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}

            <View style={styles.card}>
              <Text style={styles.cardLabel}>HOW CLEAN WAS IT?</Text>
              <Text style={styles.body}>
                You followed the plan on{' '}
                <Text style={styles.metaBold}>
                  {Math.round(result.compliance * 100)}%
                </Text>{' '}
                of days
                {result.compliance < MIN_COMPLIANCE
                  ? ', below the 70% needed for a trusted result.'
                  : '.'}
              </Text>
              {result.flags.length > 0 ? (
                result.flags.map((f) => (
                  <Text key={f} style={styles.flag}>
                    ⚠️ {f}
                  </Text>
                ))
              ) : (
                <Text style={styles.body}>
                  No sick days, travel or unusual heart readings got in the way.
                </Text>
              )}
              <Text style={styles.caveat}>
                One person, no blinding: this tells you what works for you, not
                what works for everyone.
              </Text>
            </View>

            <TouchableOpacity
              style={styles.aiButton}
              onPress={() => {
                Clipboard.setString(buildResultsPrompt(exp));
                Alert.alert('Prompt copied', 'Paste it into ChatGPT, Claude or any AI to talk through your result.');
              }}
            >
              <Text style={styles.aiButtonText}>🤖 EXPLAIN MY RESULT WITH AI</Text>
            </TouchableOpacity>
          </>
        )}

        {exp.status === 'active' && (
          <>
            <View style={styles.locked}>
              <Text style={styles.lockedTitle}>🔒 RESULTS LOCKED</Text>
              <Text style={styles.body}>
                They unlock on {formatDate(addDays(exp.endDate, 2))}. Looking at
                results halfway through tempts you to change behaviour, and that
                ruins the experiment.
              </Text>
            </View>
            <CheckinGrid exp={exp} checkins={checkins} today={today} />
            <TouchableOpacity style={styles.abandon} onPress={abandon}>
              <Text style={styles.abandonText}>ABANDON EXPERIMENT</Text>
            </TouchableOpacity>
          </>
        )}

        {exp.status === 'abandoned' && (
          <View style={styles.locked}>
            <Text style={styles.lockedTitle}>🐀 ABANDONED</Text>
            <Text style={styles.body}>
              Stopped on{' '}
              {exp.ended_at
                ? new Date(exp.ended_at).toLocaleDateString()
                : 'an unknown date'}
              . No result was calculated.
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PrimaryResult({
  r,
  schedule,
}: {
  r: MetricResult;
  schedule: Experiment['schedule'];
}) {
  const v = VERDICT_LABELS[r.verdict];
  const def = METRICS[r.metric];
  const values = r.blockMeans.filter((x): x is number => x != null);
  const max = Math.max(...values, 0);
  const min = Math.min(...values, max);
  // Bars start a little below the lowest week so differences stay visible;
  // the axis label states the floor so the chart doesn't exaggerate.
  const floor =
    def.unit === '%' || def.id === 'attendance'
      ? 0
      : Math.max(0, min - (max - min || max * 0.1));
  const CHART_H = 110;

  return (
    <View style={[styles.card, { borderColor: v.color }]}>
      <Text style={[styles.verdict, { color: v.color }]}>
        {v.icon} {v.label.toUpperCase()}
      </Text>
      <Text style={styles.verdictMetric}>{def.label}</Text>
      <View style={styles.compare}>
        <View style={styles.compareCol}>
          <Text style={styles.compareLabel}>RULE ON</Text>
          <Text style={styles.compareValue}>
            {formatValue(r.metric, r.onMean)}
          </Text>
          <Text style={styles.compareN}>{r.nOn} days</Text>
        </View>
        <View style={styles.compareCol}>
          <Text style={styles.compareLabel}>RULE OFF</Text>
          <Text style={styles.compareValue}>
            {formatValue(r.metric, r.offMean)}
          </Text>
          <Text style={styles.compareN}>{r.nOff} days</Text>
        </View>
        <View style={styles.compareCol}>
          <Text style={styles.compareLabel}>DIFFERENCE</Text>
          <Text style={styles.compareValue}>
            {formatValue(r.metric, r.diff, true)}
          </Text>
          <Text style={styles.compareN}>
            {r.threshold != null
              ? `noise ±${formatValue(r.metric, r.threshold)}`
              : ''}
          </Text>
        </View>
      </View>
      <Text style={styles.body}>{r.reason}</Text>

      {values.length > 0 && (
        <WeekBars
          r={r}
          schedule={schedule}
          floor={floor}
          max={max}
          height={CHART_H}
        />
      )}
    </View>
  );
}

/** One bar per week, coloured by phase, so on/off alternation is visible at a glance. */
function WeekBars({
  r,
  schedule,
  floor,
  max,
  height,
}: {
  r: MetricResult;
  schedule: Experiment['schedule'];
  floor: number;
  max: number;
  height: number;
}) {
  const [selected, setSelected] = useState<number | null>(null);
  const span = Math.max(1e-6, max - floor);
  return (
    <View style={{ marginTop: 16 }}>
      <View style={styles.legend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: ON_COLOR }]} />
          <Text style={styles.legendText}>Rule on</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendSwatch, { backgroundColor: OFF_COLOR }]} />
          <Text style={styles.legendText}>Rule off</Text>
        </View>
      </View>
      <View style={[styles.bars, { height: height + 20 }]}>
        {r.blockMeans.map((m, b) => {
          const on = schedule[b] === 'B';
          const h = m == null ? 0 : Math.max(4, ((m - floor) / span) * height);
          return (
            <TouchableOpacity
              key={b}
              style={styles.barCol}
              onPress={() => setSelected(selected === b ? null : b)}
              activeOpacity={0.7}
            >
              <Text style={[styles.barValue, selected !== b && { opacity: 0 }]}>
                {formatValue(r.metric, m)}
              </Text>
              <View
                style={[
                  styles.bar,
                  { height: h, backgroundColor: on ? ON_COLOR : OFF_COLOR },
                ]}
              />
            </TouchableOpacity>
          );
        })}
      </View>
      <View style={styles.barLabels}>
        {r.blockMeans.map((_, b) => (
          <Text key={b} style={styles.barLabel}>
            Week {b + 1}
          </Text>
        ))}
      </View>
      <Text style={styles.axisNote}>
        Average per week. Bars start at {formatValue(r.metric, floor)}. Tap a
        bar for its value.
      </Text>
    </View>
  );
}

function CheckinGrid({
  exp,
  checkins,
  today,
}: {
  exp: Experiment;
  checkins: Map<string, boolean>;
  today: string;
}) {
  const days = Array.from({ length: EXPERIMENT_DAYS }, (_, i) =>
    addDays(exp.start_date, i),
  );
  const complied = [...checkins.values()].filter(Boolean).length;
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>CHECK-INS · {complied} DAYS ON PLAN</Text>
      {[0, 1, 2, 3].map((b) => (
        <View key={b} style={styles.gridRow}>
          <Text
            style={[
              styles.gridWeek,
              exp.schedule[b] === 'B' && { color: colors.accent },
            ]}
          >
            {exp.schedule[b] === 'B' ? 'ON' : 'OFF'}
          </Text>
          {days.slice(b * BLOCK_DAYS, (b + 1) * BLOCK_DAYS).map((d) => {
            const c = checkins.get(d);
            return (
              <View
                key={d}
                style={[styles.gridCell, d === today && styles.gridToday]}
              >
                <Text style={styles.gridMark}>
                  {c === true
                    ? '✅'
                    : c === false
                      ? '❌'
                      : d < today
                        ? '·'
                        : ''}
                </Text>
              </View>
            );
          })}
        </View>
      ))}
      <Text style={styles.axisNote}>
        ✅ followed the plan · ❌ didn’t · · missed check-in (doesn’t count)
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  missing: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 48,
  },
  head: { alignItems: 'center', marginBottom: 16 },
  emoji: { fontSize: 44 },
  title: {
    fontFamily: fonts.heading,
    fontSize: 26,
    color: colors.text,
    textAlign: 'center',
    marginTop: 6,
  },
  status: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.accent,
    marginTop: 6,
  },
  dates: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 2,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  cardLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textDim,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.accent,
    marginTop: 6,
    marginBottom: 10,
    marginLeft: 4,
  },
  hypothesis: {
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
    fontStyle: 'italic',
  },
  ruleBox: {
    backgroundColor: 'rgba(168, 255, 62, 0.12)',
    borderRadius: 10,
    padding: 10,
  },
  ruleBoxOff: { backgroundColor: '#242424' },
  ruleOnLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.accent,
    marginBottom: 2,
  },
  ruleOffLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.textMuted,
    marginBottom: 2,
  },
  ruleText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
    lineHeight: 18,
  },
  metaLine: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  metaBold: { fontFamily: fonts.bodyBold, color: colors.text },
  body: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  verdict: { fontFamily: fonts.heading, fontSize: 26 },
  verdictMetric: {
    fontFamily: fonts.bodySemi,
    fontSize: 14,
    color: colors.text,
    marginTop: -6,
  },
  compare: { flexDirection: 'row', gap: 8, marginVertical: 4 },
  compareCol: {
    flex: 1,
    backgroundColor: '#242424',
    borderRadius: 10,
    padding: 10,
    alignItems: 'center',
  },
  compareLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    letterSpacing: 1,
    color: colors.textDim,
  },
  compareValue: {
    fontFamily: fonts.numeric,
    fontSize: 15,
    color: colors.text,
    marginTop: 4,
    textAlign: 'center',
  },
  compareN: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    marginTop: 2,
    textAlign: 'center',
  },
  legend: { flexDirection: 'row', gap: 16, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendSwatch: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  barCol: { flex: 1, alignItems: 'center', justifyContent: 'flex-end' },
  barValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.text,
    marginBottom: 4,
  },
  bar: { width: '60%', borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  barLabels: { flexDirection: 'row', marginTop: 6 },
  barLabel: {
    flex: 1,
    textAlign: 'center',
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textDim,
  },
  axisNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 6,
  },
  secRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  secMetric: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.text,
  },
  secDiff: {
    fontFamily: fonts.numeric,
    fontSize: 12,
    color: colors.text,
    minWidth: 70,
    textAlign: 'right',
  },
  secVerdict: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    minWidth: 110,
    textAlign: 'right',
  },
  flag: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.warn,
    lineHeight: 19,
  },
  caveat: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    lineHeight: 15,
  },
  locked: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 6,
  },
  lockedTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.text },
  gridRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  gridWeek: {
    width: 32,
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
  },
  gridCell: {
    flex: 1,
    aspectRatio: 1,
    borderRadius: 6,
    backgroundColor: '#242424',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridToday: { borderWidth: 1, borderColor: colors.text },
  gridMark: { fontSize: 12, color: colors.textDim },
  aiButton: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 13,
    alignItems: 'center',
    marginBottom: 14,
  },
  aiButtonText: { fontFamily: fonts.bodyBold, fontSize: 13, letterSpacing: 1, color: colors.accent },
  abandon: { alignItems: 'center', paddingVertical: 14, marginTop: 8 },
  abandonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.danger,
  },
});
