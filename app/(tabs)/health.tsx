import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  Linking,
  Dimensions,
} from 'react-native';
import { useFocusEffect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Activity,
  Moon,
  TrendingUp,
  Heart,
  Download,
  Clock,
  Dumbbell,
  Settings as SettingsIcon,
} from 'lucide-react-native';
import {
  HealthConnectService,
  type HealthAvailability,
} from '@/services/HealthConnectService';
import {
  HealthScoreService,
  bandForScore,
  MIN_BASELINE_DAYS,
  type HealthBaselineSummary,
} from '@/services/HealthScoreService';
import {
  HealthProfileService,
  type HealthProfile,
} from '@/services/HealthProfileService';
import { ScoreRing } from '@/components/ScoreRing';
import { StatTile } from '@/components/StatTile';
import { SleepHypnogram } from '@/components/SleepHypnogram';
import { TrendChart } from '@/components/TrendChart';
import { HealthProfilePrompt } from '@/components/HealthProfilePrompt';
import { LogWeightCard } from '@/components/LogWeightCard';
import { AnalysisPromptCard } from '@/components/AnalysisPromptCard';
import { StepsGoalCard } from '@/components/StepsGoalCard';
import { DailyJournalCard } from '@/components/DailyJournalCard';
import { MetricsGuide } from '@/components/MetricsGuide';
import { HeartRateZoneChart } from '@/components/HeartRateZoneChart';
import {
  colors,
  fonts,
  sleepStageColors,
  chartColors,
} from '@/constants/theme';
import { TourTarget, useFirstVisitTour } from '@/components/tour/Tour';
import { HEALTH_TOUR, HEALTH_TOUR_STEPS } from '@/constants/tour';
import { getLocalDateString } from '@/utils/dateUtils';
import type {
  HealthDailyMetrics,
  HealthSleepSession,
  HealthSleepStage,
} from '@/database/database';

const HEALTH_CONNECT_PLAY_URL =
  'https://play.google.com/store/apps/details?id=com.google.android.apps.healthdata';

type Series = { date: string; value: number }[];

/**
 * Shared empty array. Writing `?? []` inline creates a new array on every
 * render, which changes the prop identity and defeats TrendChart's memo — so
 * all eight charts would re-render on any state change.
 */
const EMPTY_SERIES: Series = [];

/** Trend windows. 30 is the practical ceiling for a fresh install, since Health
 *  Connect only serves 30 days, but longer ranges fill in as the local cache
 *  accumulates history beyond that. */
const RANGE_OPTIONS = [
  { days: 7, label: '7D' },
  { days: 14, label: '14D' },
  { days: 30, label: '30D' },
  { days: 90, label: '90D' },
] as const;

const formatDuration = (minutes?: number | null) => {
  if (minutes == null) return null;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const formatSyncedAt = (iso: string | null) => {
  if (!iso) return 'NEVER SYNCED';
  const diffMin = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMin < 1) return 'SYNCED JUST NOW';
  if (diffMin < 60) return `SYNCED ${diffMin}M AGO`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `SYNCED ${diffHr}H AGO`;
  return `SYNCED ${Math.round(diffHr / 24)}D AGO`;
};

export default function HealthScreen() {
  const insets = useSafeAreaInsets();

  const [availability, setAvailability] = useState<HealthAvailability | null>(
    null,
  );
  const [dialogBlocked, setDialogBlocked] = useState(false);
  const [today, setToday] = useState<HealthDailyMetrics | null>(null);
  const [baseline, setBaseline] = useState<HealthBaselineSummary | null>(null);
  const [sleep, setSleep] = useState<{
    session: HealthSleepSession;
    stages: HealthSleepStage[];
  } | null>(null);
  const [series, setSeries] = useState<Record<string, Series>>({});
  const [recentNights, setRecentNights] = useState<
    {
      local_date: string;
      awake_min: number;
      light_min: number;
      deep_min: number;
      rem_min: number;
      total_duration_min: number;
    }[]
  >([]);
  const [grantedTypes, setGrantedTypes] = useState<Set<string>>(new Set());
  const [lastSynced, setLastSynced] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [profile, setProfile] = useState<HealthProfile | null>(null);
  const [latestWeight, setLatestWeight] = useState<{
    kg: number;
    date: string;
  } | null>(null);
  const [avgSteps, setAvgSteps] = useState<number | null>(null);
  const [workouts, setWorkouts] = useState<
    {
      exercise_name: string;
      title: string | null;
      local_date: string;
      start_time: string;
      duration_min: number;
      avg_heart_rate: number | null;
    }[]
  >([]);
  const [consistency, setConsistency] = useState<{
    score: number | null;
    avgBedtime: string | null;
    avgWakeTime: string | null;
    nights: number;
  }>({ score: null, avgBedtime: null, avgWakeTime: null, nights: 0 });
  /** Incremented on each journal save so the prompt card re-reads its count. */
  const [journalSaves, setJournalSaves] = useState(0);
  const [trendRange, setTrendRange] = useState<number>(30);

  /** Read whatever is already cached. Fast, so it runs before any sync. */
  const loadCached = useCallback(async () => {
    const [
      todayMetrics,
      base,
      latestSleep,
      synced,
      trendSeries,
      cons,
      nights,
      prof,
      weight,
      stepsAvg,
      sessions,
    ] = await Promise.all([
      HealthScoreService.getTodayMetrics(),
      HealthScoreService.getBaseline(),
      HealthConnectService.getLatestSleepSession(),
      HealthConnectService.getLastSyncedAt(),
      HealthScoreService.getTrendSeries(trendRange),
      HealthScoreService.getSleepConsistency(),
      HealthScoreService.getRecentSleepNights(7),
      HealthProfileService.getProfile(),
      HealthScoreService.getLatestWeight(),
      HealthScoreService.getWeeklyAverageSteps(),
      HealthConnectService.getRecentExerciseSessions(10),
    ]);

    setToday(todayMetrics);
    setBaseline(base);
    setSleep(latestSleep);
    setLastSynced(synced);
    setSeries(trendSeries);
    setConsistency(cons);
    setRecentNights(nights);
    setProfile(prof);
    setLatestWeight(weight);
    setAvgSteps(stepsAvg);
    setWorkouts(sessions);
  }, [trendRange]);

  // Re-read the series when the range filter changes, without a full re-sync.
  useEffect(() => {
    HealthScoreService.getTrendSeries(trendRange)
      .then(setSeries)
      .catch(() => {});
  }, [trendRange]);

  const syncAndReload = useCallback(
    async (force = false) => {
      const state = await HealthConnectService.getAvailability();
      setAvailability(state);
      setDialogBlocked(await HealthConnectService.isPermissionDialogBlocked());

      if (state === 'ready' || state === 'partial') {
        setGrantedTypes(await HealthConnectService.getGrantedRecordTypes());
        await HealthConnectService.syncAll(force);
        await HealthScoreService.recomputeAll();
      }
      await loadCached();
    },
    [loadCached],
  );

  useFocusEffect(
    useCallback(() => {
      let active = true;

      // Render cached data first, then sync well after the screen has settled.
      // The delay matters: starting a sync during the focus transition competes
      // with mounting six charts and the rest of this screen, and the tab reads
      // as frozen while that resolves.
      loadCached().catch(() => {});

      const timer = setTimeout(() => {
        if (active) syncAndReload(false).catch(() => {});
      }, 1200);

      return () => {
        active = false;
        clearTimeout(timer);
      };
    }, [loadCached, syncAndReload]),
  );

  const handleConnect = async () => {
    if (dialogBlocked) {
      HealthConnectService.openSettings();
      return;
    }
    const next = await HealthConnectService.requestPermissions();
    setAvailability(next);
    setDialogBlocked(await HealthConnectService.isPermissionDialogBlocked());
    if (next === 'ready' || next === 'partial') {
      await syncAndReload(true);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await syncAndReload(true);
    setRefreshing(false);
  };

  const grantIfMissing = (recordType: string) =>
    grantedTypes.has(recordType) ? undefined : handleConnect;

  const recovery = today?.recovery_score ?? null;
  const recoveryColor =
    recovery != null ? bandForScore(recovery).color : colors.textFaint;
  const sleepPerf = today?.sleep_performance ?? null;
  const sleepColor =
    sleepPerf != null ? bandForScore(sleepPerf).color : colors.textFaint;

  const baselineBuilding = baseline != null && !baseline.ready;
  const showDashboard = availability === 'ready' || availability === 'partial';
  const scrollRef = useRef<ScrollView>(null);
  // Only once there is a dashboard to point at; the connect card explains itself.
  useFirstVisitTour(HEALTH_TOUR, HEALTH_TOUR_STEPS, undefined, {
    enabled: showDashboard,
    delayMs: 900,
  });

  // Compare against the back-transformed geometric mean, not the ln-space value.
  const hrvDelta =
    today?.hrv_ms != null && baseline?.hrvMeanMs
      ? Math.round(
          ((today.hrv_ms - baseline.hrvMeanMs) / baseline.hrvMeanMs) * 100,
        )
      : null;

  const chartWidth = Dimensions.get('window').width - 64;

  const asleepToday = sleep
    ? sleep.session.light_min + sleep.session.deep_min + sleep.session.rem_min
    : 0;

  // getTodayMetrics falls back to the most recent day with data, so the row
  // labelled "today" can be older than today. Name the day it actually is
  // rather than quietly mislabelling yesterday's trace.
  const hrChartTitle =
    today?.local_date && today.local_date !== getLocalDateString(new Date())
      ? `HEART RATE — ${new Date(today.local_date)
          .toLocaleDateString(undefined, {
            weekday: 'short',
            day: 'numeric',
            month: 'short',
          })
          .toUpperCase()}`
      : 'HEART RATE TODAY';

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>HEALTH</Text>
        <Text style={styles.subtitle}>{formatSyncedAt(lastSynced)}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.content}
        contentContainerStyle={{ paddingBottom: insets.bottom + 86 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          showDashboard ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          ) : undefined
        }
      >
        {/* ---------------------------------------------- availability states */}
        {availability === 'unsupported' && (
          <View style={styles.stateCard}>
            <Text style={styles.stateTitle}>
              HEALTH CONNECT IS ANDROID ONLY
            </Text>
            <Text style={styles.stateBody}>
              Open NoWomp on your Android phone to see recovery and sleep.
            </Text>
          </View>
        )}

        {(availability === 'not_installed' ||
          availability === 'update_required') && (
          <View style={styles.stateCard}>
            <Download size={28} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.stateTitle}>
              {availability === 'not_installed'
                ? 'HEALTH CONNECT NOT INSTALLED'
                : 'HEALTH CONNECT NEEDS AN UPDATE'}
            </Text>
            <Text style={styles.stateBody}>
              NoWomp reads your health data through Health Connect. Install it
              from the Play Store to continue.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={() => Linking.openURL(HEALTH_CONNECT_PLAY_URL)}
            >
              <Text style={styles.primaryButtonText}>
                {availability === 'not_installed' ? 'INSTALL' : 'UPDATE'}
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {availability === 'needs_permission' && (
          <View style={styles.stateCard}>
            <Heart size={28} color={colors.accent} strokeWidth={2.5} />
            <Text style={styles.stateTitle}>CONNECT YOUR HEALTH DATA</Text>
            <Text style={styles.stateBody}>
              NoWomp reads sleep, heart rate, HRV, steps, calories and weight to
              work out how recovered you are. All of it stays on your phone —
              nothing is ever uploaded.
            </Text>
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleConnect}
            >
              <Text style={styles.primaryButtonText}>
                {dialogBlocked
                  ? 'OPEN HEALTH CONNECT SETTINGS'
                  : 'CONNECT HEALTH CONNECT'}
              </Text>
            </TouchableOpacity>
            {dialogBlocked && (
              <Text style={styles.stateHint}>
                Android stops showing the permission prompt after two refusals.
                Grant access in Health Connect settings instead.
              </Text>
            )}
          </View>
        )}

        {availability === 'partial' && (
          <TouchableOpacity style={styles.banner} onPress={handleConnect}>
            <Text style={styles.bannerText}>
              SOME DATA ISN’T SHARED YET — TAP TO GRANT THE REST
            </Text>
          </TouchableOpacity>
        )}

        {/* --------------------------------------------------------- dashboard */}
        {showDashboard && (
          <>
            {/* Asks for the inputs the formulas need instead of assuming them. */}
            {profile && (
              <HealthProfilePrompt
                profile={profile}
                onSaved={() => syncAndReload(true)}
              />
            )}

            <TourTarget id="health.recovery" scrollRef={scrollRef}>
              <View style={styles.heroSection}>
                <ScoreRing
                  score={recovery}
                  color={recoveryColor}
                  size={190}
                  label="RECOVERY"
                />
                {baselineBuilding ? (
                  <Text style={styles.heroCaption}>
                    BUILDING BASELINE — {baseline?.sampleDays ?? 0}/
                    {MIN_BASELINE_DAYS} DAYS
                  </Text>
                ) : recovery == null ? (
                  <Text style={styles.heroCaption}>
                    NO DATA YET — WEAR YOUR DEVICE AND SYNC
                  </Text>
                ) : (
                  <Text style={styles.heroCaption}>
                    {today?.hrv_ms != null
                      ? `HRV ${Math.round(today.hrv_ms)}MS`
                      : 'HRV --'}
                    {hrvDelta != null
                      ? ` · ${hrvDelta >= 0 ? '+' : ''}${hrvDelta}% VS BASELINE`
                      : ''}
                    {today?.recovery_estimated ? ' · ESTIMATED' : ''}
                  </Text>
                )}

                {/* Sits under the score because that is where "what does 62
                  actually mean" gets asked. */}
                <MetricsGuide />
              </View>
            </TourTarget>

            {/* ------------------------------------------------------- sleep */}
            <TourTarget id="health.sleep" scrollRef={scrollRef}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Moon size={18} color={colors.accent} strokeWidth={2.5} />
                  <Text style={styles.sectionTitle}>SLEEP</Text>
                </View>

                <View style={styles.sleepCard}>
                  <ScoreRing
                    score={sleepPerf}
                    color={sleepColor}
                    size={104}
                    strokeWidth={10}
                  />
                  <View style={styles.sleepMeta}>
                    <Text style={styles.sleepValue}>
                      {formatDuration(today?.sleep_duration_min) ?? '--'}
                    </Text>
                    <Text style={styles.sleepLabel}>
                      OF {formatDuration(today?.sleep_need_min) ?? '--'} NEEDED
                    </Text>
                    {sleep?.session ? (
                      <Text style={styles.sleepLabel}>
                        {Math.round(sleep.session.sleep_efficiency)}% EFFICIENCY
                      </Text>
                    ) : null}
                  </View>
                </View>

                {sleep ? (
                  <>
                    <View style={styles.hypnogramCard}>
                      <SleepHypnogram
                        stages={sleep.stages}
                        sessionStart={sleep.session.start_time}
                        sessionEnd={sleep.session.end_time}
                        chartWidth={chartWidth - 32}
                      />
                    </View>

                    <View style={styles.stageRow}>
                      {(
                        [
                          [
                            'AWAKE',
                            sleep.session.awake_min,
                            sleepStageColors.awake,
                          ],
                          [
                            'LIGHT',
                            sleep.session.light_min,
                            sleepStageColors.light,
                          ],
                          [
                            'DEEP',
                            sleep.session.deep_min,
                            sleepStageColors.deep,
                          ],
                          ['REM', sleep.session.rem_min, sleepStageColors.rem],
                        ] as const
                      ).map(([label, minutes, color]) => {
                        const pct =
                          asleepToday > 0
                            ? Math.round((minutes / asleepToday) * 100)
                            : 0;
                        return (
                          <View key={label} style={styles.stageTile}>
                            <View
                              style={[
                                styles.stageDot,
                                { backgroundColor: color },
                              ]}
                            />
                            <Text style={styles.stageValue}>
                              {formatDuration(minutes) ?? '--'}
                            </Text>
                            <Text style={styles.stageLabel}>{label}</Text>
                            <Text style={styles.stagePct}>{pct}%</Text>
                          </View>
                        );
                      })}
                    </View>
                  </>
                ) : (
                  <Text style={styles.emptyNote}>
                    NO SLEEP SESSION RECORDED YET
                  </Text>
                )}

                {/* Sleep regularity — one of the strongest quality predictors. */}
                {consistency.score != null && (
                  <View style={styles.consistencyCard}>
                    <View style={styles.consistencyLeft}>
                      <Text style={styles.consistencyScore}>
                        {consistency.score}
                      </Text>
                      <Text style={styles.consistencyLabel}>CONSISTENCY</Text>
                    </View>
                    <View style={styles.consistencyRight}>
                      <View style={styles.consistencyRow}>
                        <Clock
                          size={12}
                          color={colors.textFaint}
                          strokeWidth={2.5}
                        />
                        <Text style={styles.consistencyText}>
                          BED {consistency.avgBedtime}
                        </Text>
                      </View>
                      <View style={styles.consistencyRow}>
                        <Clock
                          size={12}
                          color={colors.textFaint}
                          strokeWidth={2.5}
                        />
                        <Text style={styles.consistencyText}>
                          WAKE {consistency.avgWakeTime}
                        </Text>
                      </View>
                      <Text style={styles.consistencyHint}>
                        AVG OVER {consistency.nights} NIGHTS
                      </Text>
                    </View>
                  </View>
                )}

                {/* Last 7 nights as stacked stage bars. */}
                {recentNights.length >= 2 && (
                  <View style={styles.nightsCard}>
                    <Text style={styles.cardTitle}>
                      LAST {recentNights.length} NIGHTS
                    </Text>
                    {recentNights.map((night) => {
                      const total =
                        night.light_min +
                        night.deep_min +
                        night.rem_min +
                        night.awake_min;
                      const pct = (v: number) =>
                        total > 0 ? (v / total) * 100 : 0;
                      return (
                        <View key={night.local_date} style={styles.nightRow}>
                          <Text style={styles.nightDate}>
                            {new Date(night.local_date)
                              .toLocaleDateString(undefined, {
                                weekday: 'short',
                              })
                              .toUpperCase()}
                          </Text>
                          <View style={styles.nightBar}>
                            {(
                              [
                                [night.deep_min, sleepStageColors.deep],
                                [night.rem_min, sleepStageColors.rem],
                                [night.light_min, sleepStageColors.light],
                                [night.awake_min, sleepStageColors.awake],
                              ] as const
                            ).map(([value, color], i) =>
                              value > 0 ? (
                                <View
                                  key={i}
                                  style={{
                                    width: `${pct(value)}%`,
                                    backgroundColor: color,
                                    height: '100%',
                                  }}
                                />
                              ) : null,
                            )}
                          </View>
                          <Text style={styles.nightTotal}>
                            {formatDuration(
                              night.light_min + night.deep_min + night.rem_min,
                            )}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            </TourTarget>

            {/* ------------------------------------------------------- tiles */}
            <TourTarget id="health.today" scrollRef={scrollRef}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Activity size={18} color={colors.accent} strokeWidth={2.5} />
                  <Text style={styles.sectionTitle}>TODAY</Text>
                </View>

                {/* Steps live here as a goal ring rather than a plain tile, so
                  the count appears once on the page instead of three times. */}
                <View style={styles.stepsCardWrapper}>
                  <StepsGoalCard
                    steps={today?.steps ?? null}
                    goal={profile?.stepsGoal ?? null}
                    weeklyAverage={avgSteps}
                    onGoalSet={() => loadCached()}
                  />
                </View>

                <View style={styles.tileRow}>
                  {/* Total burn (movement + basal), matching what Google Health
                    and most trackers show. Active-only burn is the smaller
                    movement-only figure, shown underneath. */}
                  <StatTile
                    label="CAL BURNED"
                    value={
                      today?.total_calories != null
                        ? Math.round(today.total_calories)
                        : today?.active_calories != null
                          ? Math.round(today.active_calories)
                          : null
                    }
                    unit="kcal"
                    hint={
                      today?.active_calories != null
                        ? `${Math.round(today.active_calories)} ACTIVE`
                        : undefined
                    }
                    onGrant={grantIfMissing('TotalCaloriesBurned')}
                  />
                  <StatTile
                    label="WEIGHT"
                    value={
                      today?.weight_kg != null
                        ? today.weight_kg.toFixed(1)
                        : null
                    }
                    unit="kg"
                    onGrant={grantIfMissing('Weight')}
                  />
                </View>

                <View style={[styles.tileRow, styles.tileRowSpacing]}>
                  <StatTile
                    label="RESTING HR"
                    value={
                      today?.resting_hr != null
                        ? Math.round(today.resting_hr)
                        : null
                    }
                    unit="bpm"
                    hint={
                      today?.resting_hr == null &&
                      grantedTypes.has('RestingHeartRate')
                        ? 'NEEDS HR DATA'
                        : undefined
                    }
                    onGrant={grantIfMissing('RestingHeartRate')}
                  />
                  <StatTile
                    label="HRV"
                    value={
                      today?.hrv_ms != null ? Math.round(today.hrv_ms) : null
                    }
                    unit="ms"
                    onGrant={grantIfMissing('HeartRateVariabilityRmssd')}
                  />
                </View>

                {/* All-day heart rate against the training zones. Shows when the
                  day was spent at rest versus working, which no single number
                  can convey.

                  Rendered unconditionally: this used to be hidden whenever
                  hr_samples was null, so a sync bug that left the column empty
                  was indistinguishable from the feature not existing. An empty
                  state that says why is the difference between "broken" and
                  "no data yet". */}
                <View style={styles.hrChartCard}>
                  <Text style={styles.cardTitle}>{hrChartTitle}</Text>
                  {today?.hr_samples ? (
                    <HeartRateZoneChart
                      samplesJson={today.hr_samples}
                      maxHr={profile?.maxHr ?? 190}
                      width={chartWidth - 32}
                      height={180}
                      xAxisMode="clock"
                    />
                  ) : (
                    <Text style={styles.emptyNote}>
                      {grantedTypes.has('HeartRate')
                        ? 'NO HEART RATE RECORDED YET TODAY'
                        : 'HEART RATE NOT SHARED — TAP TO GRANT'}
                    </Text>
                  )}
                </View>

                <View style={styles.logWeightWrapper}>
                  <LogWeightCard
                    latest={latestWeight}
                    onLogged={() => {
                      // Refresh just the weight readouts rather than re-running
                      // every query behind this screen.
                      HealthScoreService.getLatestWeight()
                        .then(setLatestWeight)
                        .catch(() => {});
                      HealthScoreService.getTodayMetrics()
                        .then(setToday)
                        .catch(() => {});
                    }}
                  />
                </View>
              </View>
            </TourTarget>

            {/* ------------------------------------------------------ trends */}
            <TourTarget id="health.trends" scrollRef={scrollRef}>
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <TrendingUp
                    size={18}
                    color={colors.accent}
                    strokeWidth={2.5}
                  />
                  <Text style={styles.sectionTitle}>TRENDS</Text>
                </View>

                <View style={styles.rangeRow}>
                  {RANGE_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.days}
                      style={[
                        styles.rangeChip,
                        trendRange === opt.days && styles.rangeChipActive,
                      ]}
                      onPress={() => setTrendRange(opt.days)}
                    >
                      <Text
                        style={[
                          styles.rangeChipText,
                          trendRange === opt.days && styles.rangeChipTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <TrendChart
                  title="RECOVERY"
                  data={series.recovery ?? EMPTY_SERIES}
                  width={chartWidth}
                  color={chartColors.blue}
                  unit="%"
                />
                <TrendChart
                  title="HRV"
                  data={series.hrv ?? EMPTY_SERIES}
                  width={chartWidth}
                  color={chartColors.orange}
                  unit="ms"
                />
                <TrendChart
                  title="RESTING HEART RATE"
                  data={series.rhr ?? EMPTY_SERIES}
                  width={chartWidth}
                  color={chartColors.red}
                  unit="bpm"
                />
                <TrendChart
                  title="SLEEP DURATION"
                  data={series.sleep ?? EMPTY_SERIES}
                  width={chartWidth}
                  color={chartColors.violet}
                  format={(v) => formatDuration(v) ?? '--'}
                />
                {/* Bars, not a line: each day is a discrete total, and a line
                  between them would imply steps accrued continuously overnight. */}
                <TrendChart
                  title="STEPS"
                  data={series.steps ?? EMPTY_SERIES}
                  width={chartWidth}
                  color={chartColors.aqua}
                  variant="bar"
                  goal={profile?.stepsGoal ?? null}
                  goalLabel="GOAL"
                  format={(v) => Math.round(v).toLocaleString()}
                />
                <TrendChart
                  title="CALORIES BURNED"
                  data={
                    (series.totalCalories?.length ?? 0) > 0
                      ? series.totalCalories
                      : (series.activeCalories ?? EMPTY_SERIES)
                  }
                  width={chartWidth}
                  color={chartColors.yellow}
                  unit="kcal"
                />
                <TrendChart
                  title="WEIGHT"
                  data={series.weight ?? EMPTY_SERIES}
                  width={chartWidth}
                  color={chartColors.magenta}
                  unit="kg"
                  format={(v) => v.toFixed(1)}
                />
              </View>
            </TourTarget>

            {workouts.length > 0 && (
              <TourTarget id="health.workouts" scrollRef={scrollRef}>
                <View style={styles.section}>
                  <TouchableOpacity
                    style={styles.workoutsButton}
                    onPress={() => router.push('/workouts')}
                    activeOpacity={0.8}
                  >
                    <Dumbbell size={18} color={colors.bg} strokeWidth={2.5} />
                    <Text style={styles.workoutsButtonText}>
                      VIEW WORKOUTS ({workouts.length})
                    </Text>
                  </TouchableOpacity>
                </View>
              </TourTarget>
            )}

            {/* Subjective context the sensors can't capture. Sits directly
                above the prompt card, since it feeds straight into it. */}
            <TourTarget id="health.journal" scrollRef={scrollRef}>
              <View style={styles.section}>
                {/* Journal entries don't feed any of the metrics on this screen,
                  so only the prompt card needs refreshing — a full reload here
                  fired 12 queries and stalled the save. */}
                <DailyJournalCard
                  onSaved={() => setJournalSaves((n) => n + 1)}
                />
              </View>
            </TourTarget>

            {/* Take-your-data-elsewhere analysis, at the end of the page. */}
            <TourTarget id="health.ai" scrollRef={scrollRef}>
              <View style={styles.section}>
                <AnalysisPromptCard refreshKey={journalSaves} />
              </View>
            </TourTarget>

            <View style={styles.section}>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => HealthConnectService.openSettings()}
              >
                <SettingsIcon
                  size={16}
                  color={colors.textMuted}
                  strokeWidth={2.5}
                />
                <Text style={styles.secondaryButtonText}>
                  MANAGE HEALTH CONNECT
                </Text>
              </TouchableOpacity>
              <Text style={styles.footnote}>
                Recovery and sleep scores are calculated on your phone from your
                own data. Nothing is uploaded.
              </Text>
              <Text style={styles.methodology}>
                HRV is analysed as ln(RMSSD) against a 7-day rolling baseline,
                with changes judged by the Smallest Worthwhile Change (0.5 ×
                SD). Max heart rate uses the Tanaka formula (208 − 0.7 × age).
                Sleep targets follow National Sleep Foundation age bands
                {profile && !profile.sleepGoalIsEstimated
                  ? ', overridden by your goal'
                  : ''}
                . Training load uses Banister’s TRIMP
                {profile?.sexIsUnspecified
                  ? ' (male curve — set your sex to refine)'
                  : ''}
                .
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    paddingTop: 60,
    paddingHorizontal: 32,
    paddingBottom: 24,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.heading,
    fontSize: 32,
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    letterSpacing: 1,
    marginTop: 4,
  },
  content: {
    flex: 1,
    paddingHorizontal: 32,
  },
  stateCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 24,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
    marginBottom: 24,
    gap: 12,
  },
  stateTitle: {
    fontFamily: fonts.heading,
    fontSize: 18,
    color: colors.text,
    textAlign: 'center',
  },
  stateBody: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
  },
  stateHint: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    textAlign: 'center',
    lineHeight: 16,
  },
  primaryButton: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    letterSpacing: 0.5,
  },
  banner: {
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.warn,
    padding: 12,
    marginBottom: 20,
  },
  bannerText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.warn,
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 36,
    gap: 12,
  },
  heroCaption: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
    textAlign: 'center',
  },
  section: {
    marginBottom: 32,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  sectionTitle: {
    fontFamily: fonts.heading,
    fontSize: 20,
    color: colors.accent,
  },
  cardTitle: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 1,
    marginBottom: 12,
  },
  sleepCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
  },
  sleepMeta: {
    flex: 1,
    gap: 4,
  },
  sleepValue: {
    fontFamily: fonts.numericHeavy,
    fontSize: 26,
    color: colors.text,
  },
  sleepLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  hypnogramCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
  },
  stageRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  stageTile: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: 'center',
    gap: 3,
  },
  stageDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginBottom: 2,
  },
  stageValue: {
    fontFamily: fonts.numeric,
    fontSize: 12,
    color: colors.text,
  },
  stageLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  stagePct: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
  },
  consistencyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
    gap: 20,
  },
  consistencyLeft: {
    alignItems: 'center',
  },
  consistencyScore: {
    fontFamily: fonts.numericHeavy,
    fontSize: 30,
    color: colors.cyan,
  },
  consistencyLabel: {
    fontFamily: fonts.bodyBold,
    fontSize: 8,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  consistencyRight: {
    flex: 1,
    gap: 4,
  },
  consistencyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  consistencyText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.text,
    letterSpacing: 0.5,
  },
  consistencyHint: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    marginTop: 2,
  },
  nightsCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
  },
  nightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
  },
  nightDate: {
    fontFamily: fonts.bodyBold,
    fontSize: 9,
    color: colors.textMuted,
    width: 32,
  },
  nightBar: {
    flex: 1,
    height: 12,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
    backgroundColor: colors.bg,
  },
  nightTotal: {
    fontFamily: fonts.numeric,
    fontSize: 9,
    color: colors.textMuted,
    width: 48,
    textAlign: 'right',
  },
  tileRow: {
    flexDirection: 'row',
    gap: 12,
  },
  tileRowSpacing: {
    marginTop: 12,
  },
  workoutsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
  },
  workoutsButtonText: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.bg,
    letterSpacing: 0.5,
  },
  hrChartCard: {
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    padding: 16,
    marginTop: 12,
  },
  logWeightWrapper: {
    marginTop: 12,
  },
  stepsCardWrapper: {
    marginBottom: 12,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
  },
  rangeChip: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 8,
    alignItems: 'center',
  },
  rangeChipActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rangeChipText: {
    fontFamily: fonts.bodyBold,
    fontSize: 10,
    color: colors.textMuted,
    letterSpacing: 0.5,
  },
  rangeChipTextActive: {
    color: colors.bg,
  },
  emptyNote: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: colors.textFaint,
    letterSpacing: 1,
    textAlign: 'center',
    paddingVertical: 20,
  },
  secondaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.border,
    paddingVertical: 14,
  },
  secondaryButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 11,
    color: colors.textMuted,
    letterSpacing: 1,
  },
  footnote: {
    fontFamily: fonts.body,
    fontSize: 10,
    color: colors.textFaint,
    lineHeight: 15,
    textAlign: 'center',
    marginTop: 14,
  },
  methodology: {
    fontFamily: fonts.body,
    fontSize: 9,
    color: colors.textFaint,
    lineHeight: 14,
    textAlign: 'center',
    marginTop: 10,
    opacity: 0.8,
  },
});
