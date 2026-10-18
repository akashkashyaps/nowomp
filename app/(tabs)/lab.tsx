import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { ChevronRight } from 'lucide-react-native';
import {
  ExperimentService,
  type Experiment,
  type LibraryEntry,
} from '@/services/ExperimentService';
import { ExperimentCard } from '@/components/ExperimentCard';
import { HabitsCard, BestTimeCard } from '@/components/HabitInsights';
import { HabitInsightsService, type BestTimeReport, type HabitReport } from '@/services/HabitInsightsService';
import { TourTarget, useFirstVisitTour } from '@/components/tour/Tour';
import { LAB_TOUR, LAB_TOUR_STEPS } from '@/constants/tour';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  LabService,
  MIN_SKIPS_FOR_PATTERNS,
  formatMinutes,
  type LabReport,
  type Verdict,
  type TimeSlot,
} from '@/services/LabService';
import {
  getExcuse,
  CATEGORY_LABELS,
  type ExcuseCategory,
} from '@/constants/excuses';
import { colors, fonts, chartColors } from '@/constants/theme';
import { parseLocalDateString } from '@/utils/dateUtils';

const DAY_SHORT = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];
const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: 'morning (before noon)',
  afternoon: 'afternoon (noon–5pm)',
  evening: 'evening (after 5pm)',
};

/** Categorical slots in the theme's fixed order — identity, not rank. */
const CATEGORY_COLORS: Record<ExcuseCategory, string> = {
  external: chartColors.blue,
  internal: chartColors.orange,
  physical: chartColors.aqua,
};
const CATEGORY_ORDER: ExcuseCategory[] = ['external', 'internal', 'physical'];

/** Verdicts always carry an icon and a word, never colour alone. */
const VERDICT_STYLE: Record<
  Verdict,
  { icon: string; label: string; color: string }
> = {
  backed: { icon: '✅', label: 'Backed by data', color: colors.accent },
  disputed: { icon: '🤨', label: 'Your body disagrees', color: colors.danger },
  inconclusive: { icon: '🤷', label: 'Inconclusive', color: colors.warn },
  no_data: { icon: '·', label: 'No data', color: colors.textDim },
  not_checkable: { icon: '·', label: "Can't check", color: colors.textDim },
};

const formatDate = (date: string) =>
  parseLocalDateString(date).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });

export default function LabScreen() {
  const insets = useSafeAreaInsets();
  const [report, setReport] = useState<LabReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const [showAllChecks, setShowAllChecks] = useState(false);
  const [experiment, setExperiment] = useState<Experiment | null>(null);
  const [checkins, setCheckins] = useState<Map<string, boolean>>(new Map());
  const [topSuggestion, setTopSuggestion] = useState<LibraryEntry | null>(null);
  const [pastCount, setPastCount] = useState(0);

  const [habitData, setHabitData] = useState<{ habits: HabitReport; bestTime: BestTimeReport } | null>(null);
  const loadExperiments = React.useCallback(async () => {
    try {
      const active = await ExperimentService.getActive();
      setExperiment(active);
      if (active) {
        setCheckins(await ExperimentService.getCheckins(active.id));
        // Re-arm reminders; a schedule change elsewhere may have wiped them.
        ExperimentService.scheduleReminders(active).catch(() => {});
      } else {
        setTopSuggestion(
          (await ExperimentService.getLibrary()).suggested[0] ?? null,
        );
      }
      setPastCount((await ExperimentService.getHistory()).length);
      setHabitData(await HabitInsightsService.load());
    } catch (error) {
      console.error('Error loading experiments:', error);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      let active = true;
      LabService.getReport()
        .then((r) => active && setReport(r))
        .catch((error) => console.error('Error loading lab report:', error))
        .finally(() => active && setLoading(false));
      loadExperiments();
      return () => {
        active = false;
      };
    }, [loadExperiments]),
  );

  const scrollRef = React.useRef<ScrollView>(null);
  useFirstVisitTour(LAB_TOUR, LAB_TOUR_STEPS, undefined, { enabled: !loading });

  const experimentsSection = (
    <>
      <Text style={styles.sectionTitle}>EXPERIMENTS</Text>
      <TourTarget id="lab.experiments" scrollRef={scrollRef}>
        {experiment ? (
          <ExperimentCard
            exp={experiment}
            checkins={checkins}
            onChanged={loadExperiments}
          />
        ) : (
          <TouchableOpacity
            style={styles.card}
            onPress={() => router.push('/experiments')}
            activeOpacity={0.8}
          >
            <Text style={styles.startTitle}>🧫 RUN AN EXPERIMENT</Text>
            <Text style={styles.startBody}>
              Test one change for 4 weeks: rule on, off, on, off. The Lab tells
              you if it actually worked for your body.
            </Text>
            {topSuggestion?.suggestion && (
              <View style={styles.suggestion}>
                <Text style={styles.suggestionLabel}>SUGGESTED FOR YOU</Text>
                <Text style={styles.suggestionTitle}>
                  {topSuggestion.template.emoji} {topSuggestion.template.title}
                </Text>
                <Text style={styles.suggestionReason}>
                  {topSuggestion.suggestion.reason}
                </Text>
              </View>
            )}
            <View style={styles.startRow}>
              <Text style={styles.startLink}>BROWSE THE LIBRARY</Text>
              <ChevronRight size={16} color={colors.accent} />
            </View>
          </TouchableOpacity>
        )}
      </TourTarget>
      {pastCount > 0 && (
        <TouchableOpacity
          style={styles.pastRow}
          onPress={() => router.push('/experiments')}
        >
          <Text style={styles.pastText}>
            {pastCount} past {pastCount === 1 ? 'experiment' : 'experiments'} ·
            see results
          </Text>
          <ChevronRight size={16} color={colors.textDim} />
        </TouchableOpacity>
      )}
    </>
  );

  const habitsSection = (
    <>
      <Text style={styles.sectionTitle}>HABITS</Text>
      {habitData ? (
        <TourTarget id="lab.habits" scrollRef={scrollRef}>
          <HabitsCard report={habitData.habits} />
          <BestTimeCard report={habitData.bestTime} />
        </TourTarget>
      ) : null}
      <Text style={styles.sectionTitle}>EXCUSES</Text>
    </>
  );

  const insights = report ? buildInsights(report) : [];
  const enoughForPatterns = (report?.totalSkips ?? 0) >= MIN_SKIPS_FOR_PATTERNS;

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <View style={styles.titleRow}>
          <Text style={styles.title}>LAB</Text>
          <View style={styles.betaChip}>
            <Text style={styles.betaText}>EXPERIMENTAL</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          Your habits and excuses, under the microscope.
        </Text>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 48 }} />
      ) : !report || report.totalSkips === 0 ? (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 110 },
          ]}
        >
          {experimentsSection}
          {habitsSection}
          <View style={styles.emptyCard}>
            <Text style={styles.emptyEmoji}>🧪</Text>
            <Text style={styles.emptyTitle}>NOTHING TO ANALYSE</Text>
            <Text style={styles.emptyBody}>
              {
                "You haven't made a single excuse. The Lab has nothing to fact-check. Keep it that way."
              }
            </Text>
          </View>
        </ScrollView>
      ) : (
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={[
            styles.content,
            { paddingBottom: insets.bottom + 110 },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {experimentsSection}
          {habitsSection}

          {/* Honesty score */}
          <TourTarget id="lab.factcheck" scrollRef={scrollRef}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>EXCUSE FACT-CHECK</Text>
              <View style={styles.honestyRow}>
                <View style={styles.honestyHero}>
                  <Text style={styles.heroNumber}>
                    {report.honesty.score != null
                      ? `${Math.round(report.honesty.score * 100)}%`
                      : '–'}
                  </Text>
                  <Text style={styles.heroCaption}>
                    {report.honesty.score != null
                      ? 'of checkable excuses held up'
                      : `Needs ${MIN_SKIPS_FOR_PATTERNS} checkable excuses`}
                  </Text>
                </View>
                <View style={styles.honestyCounts}>
                  <CountLine
                    icon="✅"
                    label="Backed"
                    value={report.honesty.backed}
                  />
                  <CountLine
                    icon="🤨"
                    label="Disputed"
                    value={report.honesty.disputed}
                  />
                  <CountLine
                    icon="·"
                    label="Unverifiable"
                    value={
                      report.totalSkips -
                      report.honesty.backed -
                      report.honesty.disputed
                    }
                  />
                </View>
              </View>
              <Text style={styles.footnote}>
                Tired, sore, busy, anxious and sick excuses are checked against
                your sleep, recovery, steps, heart rate and journal. Everything
                runs on your phone.
              </Text>
            </View>
          </TourTarget>

          {/* Insights */}
          <Text style={styles.sectionTitle}>PATTERNS</Text>
          {insights.length > 0 ? (
            insights.map((i) => (
              <View key={i.key} style={styles.insight}>
                <Text style={styles.insightEmoji}>{i.emoji}</Text>
                <Text style={styles.insightText}>{i.text}</Text>
              </View>
            ))
          ) : (
            <View style={styles.insight}>
              <Text style={styles.insightEmoji}>🔬</Text>
              <Text style={styles.insightText}>
                {enoughForPatterns
                  ? 'No strong pattern yet. Your skips are spread out evenly.'
                  : `Patterns appear after ${MIN_SKIPS_FOR_PATTERNS} excuses. You're at ${report.totalSkips}.`}
              </Text>
            </View>
          )}

          {/* Weekday skip rate */}
          <TourTarget id="lab.patterns" scrollRef={scrollRef}>
            <View style={styles.card}>
              <Text style={styles.cardLabel}>SKIP RATE BY WEEKDAY</Text>
              <WeekdayChart
                report={report}
                selected={selectedDay}
                onSelect={(d) => setSelectedDay(d === selectedDay ? null : d)}
              />
              <Text style={styles.chartCaption}>
                {selectedDay != null
                  ? (() => {
                      const w = report.weekdays[selectedDay];
                      const total = w.skips + w.workouts;
                      return total === 0
                        ? `${DAY_NAMES[selectedDay]}: no sessions yet`
                        : `${DAY_NAMES[selectedDay]}: skipped ${w.skips} of ${total} sessions`;
                    })()
                  : 'Tap a day for details'}
              </Text>
            </View>
          </TourTarget>

          {/* Excuse mix */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>WHY YOU SKIP</Text>
            <View style={styles.stackBar}>
              {CATEGORY_ORDER.filter((c) => report.categoryMix[c] > 0).map(
                (c) => (
                  <View
                    key={c}
                    style={{
                      flex: report.categoryMix[c],
                      backgroundColor: CATEGORY_COLORS[c],
                    }}
                  />
                ),
              )}
            </View>
            <View style={styles.legend}>
              {CATEGORY_ORDER.map((c) => (
                <View key={c} style={styles.legendItem}>
                  <View
                    style={[
                      styles.legendSwatch,
                      { backgroundColor: CATEGORY_COLORS[c] },
                    ]}
                  />
                  <Text style={styles.legendText}>
                    {CATEGORY_LABELS[c]}{' '}
                    <Text style={styles.legendValue}>
                      {Math.round(
                        (report.categoryMix[c] / report.totalSkips) * 100,
                      )}
                      %
                    </Text>
                  </Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />
            {report.breakdown.map((b) => {
              const def = getExcuse(b.excuse);
              return (
                <View key={b.excuse} style={styles.breakdownRow}>
                  <Text style={styles.breakdownEmoji}>{def.emoji}</Text>
                  <Text style={styles.breakdownLabel} numberOfLines={1}>
                    {def.label}
                  </Text>
                  <View
                    style={[
                      styles.breakdownDot,
                      { backgroundColor: CATEGORY_COLORS[def.category] },
                    ]}
                  />
                  <Text style={styles.breakdownCount}>×{b.count}</Text>
                </View>
              );
            })}
          </View>

          {/* Fact-check log */}
          <Text style={styles.sectionTitle}>THE RECEIPTS</Text>
          {(showAllChecks
            ? report.factChecks
            : report.factChecks.slice(0, 8)
          ).map((f) => {
            const v = VERDICT_STYLE[f.verdict];
            const def = getExcuse(f.skip.excuse);
            return (
              <View key={f.skip.id} style={styles.checkRow}>
                <View style={styles.checkTop}>
                  <Text style={styles.checkExcuse} numberOfLines={1}>
                    {def.emoji} {def.short}
                  </Text>
                  <Text style={styles.checkDate}>
                    {formatDate(f.skip.skip_date)}
                  </Text>
                </View>
                <View style={styles.checkBottom}>
                  <View style={[styles.verdictPill, { borderColor: v.color }]}>
                    <Text style={[styles.verdictText, { color: v.color }]}>
                      {v.icon} {v.label}
                    </Text>
                  </View>
                  <Text style={styles.checkEvidence} numberOfLines={2}>
                    {f.evidence}
                  </Text>
                </View>
              </View>
            );
          })}
          {report.factChecks.length > 8 && (
            <TouchableOpacity
              onPress={() => setShowAllChecks((s) => !s)}
              style={styles.showAll}
            >
              <Text style={styles.showAllText}>
                {showAllChecks
                  ? 'SHOW LESS'
                  : `SHOW ALL ${report.factChecks.length}`}
              </Text>
            </TouchableOpacity>
          )}

        </ScrollView>
      )}
    </View>
  );
}

function buildInsights(
  r: LabReport,
): { key: string; emoji: string; text: string }[] {
  const out: { key: string; emoji: string; text: string }[] = [];

  if (r.weakDay && r.weakDay.skipRate != null) {
    out.push({
      key: 'day',
      emoji: '📅',
      text: `${DAY_NAMES[r.weakDay.day]} is your weak spot: you skip ${Math.round(
        r.weakDay.skipRate * 100,
      )}% of ${DAY_NAMES[r.weakDay.day]} sessions. Beat it for the Weak Spot Slayer trophy.`,
    });
  }
  if (r.weakSlot) {
    out.push({
      key: 'slot',
      emoji: '🕒',
      text: `Your ${SLOT_LABELS[r.weakSlot]} sessions get skipped the most. Worth moving them?`,
    });
  }
  if (r.leadUpSleep) {
    const diff = r.leadUpSleep.beforeWorkout - r.leadUpSleep.beforeSkip;
    if (Math.abs(diff) >= 20) {
      out.push({
        key: 'sleep',
        emoji: '🛌',
        text:
          diff > 0
            ? `Before a skip you sleep ${formatMinutes(r.leadUpSleep.beforeSkip)} on average, vs ${formatMinutes(
                r.leadUpSleep.beforeWorkout,
              )} before a workout. Bad nights lead to skipped days.`
            : `You actually sleep more before skips (${formatMinutes(
                r.leadUpSleep.beforeSkip,
              )}) than before workouts. Tiredness isn't the real reason.`,
      });
    }
  }
  if (r.timing.afterTheFact > 0) {
    const pct = Math.round((r.timing.afterTheFact / r.totalSkips) * 100);
    out.push({
      key: 'timing',
      emoji: '⏪',
      text: `${pct}% of your excuses were made after the fact, once the workout was already missed.`,
    });
  }
  if (r.comebackDays != null) {
    out.push({
      key: 'comeback',
      emoji: '🔄',
      text: `After a skip you're back in ${r.comebackDays.toFixed(1)} days on average.`,
    });
  }
  if (
    r.trend.recent + r.trend.previous >= 2 &&
    r.trend.recent !== r.trend.previous
  ) {
    out.push({
      key: 'trend',
      emoji: r.trend.recent < r.trend.previous ? '📉' : '📈',
      text:
        r.trend.recent < r.trend.previous
          ? `Fewer excuses lately: ${r.trend.recent} in the last 30 days vs ${r.trend.previous} the month before.`
          : `Excuses are creeping up: ${r.trend.recent} in the last 30 days vs ${r.trend.previous} the month before.`,
    });
  }
  return out;
}

function WeekdayChart({
  report,
  selected,
  onSelect,
}: {
  report: LabReport;
  selected: number | null;
  onSelect: (day: number) => void;
}) {
  const maxRate = Math.max(
    0.01,
    ...report.weekdays.map((w) => w.skipRate ?? 0),
  );
  const CHART_H = 96;

  // Monday-first, which is how most people think about a training week.
  const order = [1, 2, 3, 4, 5, 6, 0];
  return (
    <View style={styles.chart}>
      {order.map((day) => {
        const w = report.weekdays[day];
        const rate = w.skipRate ?? 0;
        const isWeak = report.weakDay?.day === day;
        const dim = selected != null && selected !== day;
        return (
          <TouchableOpacity
            key={day}
            style={styles.chartCol}
            onPress={() => onSelect(day)}
            activeOpacity={0.7}
            accessibilityLabel={`${DAY_NAMES[day]}: ${Math.round(rate * 100)} percent skipped`}
          >
            <Text
              style={[
                styles.chartValue,
                !(isWeak || selected === day) && { opacity: 0 },
              ]}
            >
              {Math.round(rate * 100)}%
            </Text>
            <View style={[styles.chartTrack, { height: CHART_H }]}>
              <View
                style={[
                  styles.chartBar,
                  {
                    height:
                      rate > 0 ? Math.max(4, (rate / maxRate) * CHART_H) : 0,
                    opacity: dim ? 0.35 : 1,
                  },
                ]}
              />
            </View>
            <Text
              style={[
                styles.chartDay,
                (isWeak || selected === day) && styles.chartDayActive,
              ]}
            >
              {DAY_SHORT[day]}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function CountLine({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.countLine}>
      <Text style={styles.countIcon}>{icon}</Text>
      <Text style={styles.countLabel}>{label}</Text>
      <Text style={styles.countValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingHorizontal: 24,
    paddingBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.text,
  },
  betaChip: {
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  betaText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.accent,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 16,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    letterSpacing: 1,
    color: colors.textDim,
    marginBottom: 12,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.accent,
    marginTop: 8,
    marginBottom: 12,
    marginLeft: 4,
  },
  honestyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  honestyHero: {
    flex: 1,
  },
  heroNumber: {
    fontFamily: fonts.numericHeavy,
    fontSize: 44,
    color: colors.text,
  },
  heroCaption: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  honestyCounts: {
    gap: 6,
    minWidth: 130,
  },
  countLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  countIcon: {
    width: 20,
    fontSize: 13,
    color: colors.textDim,
    textAlign: 'center',
  },
  countLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  countValue: {
    fontFamily: fonts.numeric,
    fontSize: 14,
    color: colors.text,
  },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    marginTop: 14,
    lineHeight: 15,
  },
  insight: {
    flexDirection: 'row',
    gap: 12,
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  insightEmoji: {
    fontSize: 20,
  },
  insightText: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 20,
    color: colors.text,
  },
  chart: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: 4,
  },
  chartCol: {
    flex: 1,
    alignItems: 'center',
  },
  chartValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.text,
    marginBottom: 4,
  },
  chartTrack: {
    width: 18,
    justifyContent: 'flex-end',
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  chartBar: {
    width: '100%',
    backgroundColor: chartColors.blue,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
  },
  chartDay: {
    fontFamily: fonts.bodySemi,
    fontSize: 12,
    color: colors.textDim,
    marginTop: 6,
  },
  chartDayActive: {
    color: colors.text,
  },
  chartCaption: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: 12,
  },
  stackBar: {
    flexDirection: 'row',
    height: 14,
    borderRadius: 7,
    overflow: 'hidden',
    gap: 2,
    backgroundColor: colors.card,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 3,
  },
  legendText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
  },
  legendValue: {
    fontFamily: fonts.bodyBold,
    color: colors.text,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: 14,
  },
  breakdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 6,
  },
  breakdownEmoji: {
    fontSize: 16,
    width: 22,
    textAlign: 'center',
  },
  breakdownLabel: {
    flex: 1,
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.text,
  },
  breakdownDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownCount: {
    fontFamily: fonts.numeric,
    fontSize: 13,
    color: colors.text,
    minWidth: 32,
    textAlign: 'right',
  },
  checkRow: {
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  checkTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  checkExcuse: {
    flex: 1,
    fontFamily: fonts.bodySemi,
    fontSize: 15,
    color: colors.text,
  },
  checkDate: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textDim,
  },
  checkBottom: {
    marginTop: 10,
    gap: 6,
  },
  verdictPill: {
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  verdictText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
  },
  checkEvidence: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
  },
  showAll: {
    alignItems: 'center',
    paddingVertical: 12,
    marginBottom: 8,
  },
  showAllText: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.accent,
  },
  startTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.text,
    marginBottom: 6,
  },
  startBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 19,
  },
  suggestion: {
    marginTop: 14,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#242424',
  },
  suggestionLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    letterSpacing: 1,
    color: colors.accent,
    marginBottom: 4,
  },
  suggestionTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 15,
    color: colors.text,
  },
  suggestionReason: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: colors.textMuted,
    marginTop: 2,
  },
  startRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 14,
  },
  startLink: {
    fontFamily: fonts.bodyBold,
    fontSize: 12,
    letterSpacing: 1,
    color: colors.accent,
  },
  pastRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginTop: -6,
    marginBottom: 16,
  },
  pastText: {
    fontFamily: fonts.bodySemi,
    fontSize: 13,
    color: colors.textMuted,
  },
  emptyCard: {
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 28,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyEmoji: {
    fontSize: 44,
    marginBottom: 12,
  },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: 22,
    color: colors.text,
    marginBottom: 8,
  },
  emptyBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
});
