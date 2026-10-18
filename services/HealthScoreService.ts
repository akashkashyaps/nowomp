import { database, type HealthDailyMetrics } from '@/database/database';
import { UserService } from './UserService';
import { HealthProfileService } from './HealthProfileService';
import { colors } from '@/constants/theme';
import { getLocalDateString, getTodayLocal } from '@/utils/dateUtils';

/**
 * Recovery and sleep scoring.
 *
 * These are NoWomp's own scores. Where the sports-science literature specifies a
 * standard method, we follow it rather than inventing one:
 *
 * - HRV is analysed as ln(RMSSD). RMSSD is strongly right-skewed, and the log
 *   transform is the standard treatment in HRV monitoring because it normalises
 *   the distribution and makes day-to-day changes comparable.
 *   (Plews et al., 2013, Sports Med; Esco & Flatt, 2014, J Sports Sci Med.)
 * - Baselines use a 7-day rolling mean, the interval established in the athlete
 *   monitoring literature as the point where daily noise (typically 10-20%)
 *   averages out while genuine trend is retained.
 * - Day-to-day change is judged against the Smallest Worthwhile Change (SWC),
 *   conventionally 0.5 x the within-subject SD, rather than a raw z-score.
 * - Max heart rate uses Tanaka (208 - 0.7 x age); sleep need follows the
 *   National Sleep Foundation age bands. See HealthProfileService.
 */

export const RECOVERY_WEIGHTS = {
  hrv: 0.55, // best-validated single autonomic recovery marker
  rhr: 0.25, // correlated with HRV but adds illness/alcohol signal
  sleep: 0.2,
} as const;

/** Slope of the logistic. 1.1 puts +/-1 SD near 75/25 — visible daily movement. */
const RECOVERY_SLOPE = 1.1;

/**
 * Below this many days a baseline is noise. Seven matches the rolling window
 * used throughout the HRV monitoring literature.
 */
export const MIN_BASELINE_DAYS = 7;

/** Rolling baseline window, in days. */
const BASELINE_WINDOW_DAYS = 7;

/**
 * Longer window used for the within-subject SD that defines the SWC. A week is
 * too few points for a stable SD estimate.
 */
const VARIABILITY_WINDOW_DAYS = 30;

/**
 * Smallest Worthwhile Change multiplier — 0.5 x SD is the standard threshold in
 * athlete monitoring for "this change is real, not noise".
 */
const SWC_MULTIPLIER = 0.5;

const MAX_SLEEP_DEBT_MIN = 90;
const WORKOUT_SLEEP_BONUS_MIN = 20;

/**
 * Sleep efficiency considered normal in healthy adults (~85%), from pooled
 * polysomnography norms. Used as the neutral anchor for the sleep term.
 */
const NORMAL_SLEEP_EFFICIENCY = 85;

export type ScoreBand = 'green' | 'yellow' | 'red';

/**
 * The single source of truth for score colors. Green reuses the app's lime
 * accent and red its danger color, so the health tab needs no new brand colors.
 */
export const bandForScore = (score: number): { band: ScoreBand; color: string } => {
  if (score >= 67) return { band: 'green', color: colors.accent };
  if (score >= 34) return { band: 'yellow', color: colors.warn };
  return { band: 'red', color: colors.danger };
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;

const stdDev = (values: number[], avg: number) => {
  if (values.length < 2) return 0;
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
};

export interface HealthBaselineSummary {
  /** Mean of ln(RMSSD) — the analysis space, not a displayable millisecond value. */
  hrvMean: number;
  /** SD of ln(RMSSD), used for the Smallest Worthwhile Change threshold. */
  hrvSd: number;
  /** Back-transformed geometric mean in ms, for display only. */
  hrvMeanMs: number;
  rhrMean: number;
  rhrSd: number;
  sleepDurationMean: number;
  sampleDays: number;
  ready: boolean; // enough history to show a score at all
}

export class HealthScoreService {
  /**
   * Roll raw health_records into per-day rows, then compute baselines and scores.
   * Safe to re-run; every write is an upsert.
   */
  /**
   * The recompute currently in flight, if any.
   *
   * App launch and Health-tab focus both trigger this independently. Because it
   * opens write transactions, two overlapping runs on the same connection
   * deadlock: SQLite serialises the second transaction while the first is still
   * awaiting JS inside its own, and neither can finish. Callers share one run.
   */
  private static recomputeInFlight: Promise<void> | null = null;

  static async recomputeAll(): Promise<void> {
    if (this.recomputeInFlight) return this.recomputeInFlight;

    this.recomputeInFlight = this.runRecompute().finally(() => {
      this.recomputeInFlight = null;
    });
    return this.recomputeInFlight;
  }

  private static async runRecompute(): Promise<void> {
    try {
      const user = await UserService.getCurrentUser();
      if (!user) return;

      await this.rollUpDailyMetrics(user.id);
      const baseline = await this.recomputeBaseline(user.id);
      await this.computeScores(user.id, baseline);
    } catch (error) {
      console.log('Health score recompute skipped:', error);
    }
  }

  /** Fold health_records + sleep sessions into one row per day. */
  private static async rollUpDailyMetrics(userId: number) {
    const db = await database.getDatabase();

    const rows = await db.getAllAsync<{
      local_date: string;
      metric_type: string;
      value: number;
    }>(
      `SELECT local_date, metric_type, value
       FROM health_records
       WHERE user_id = ?`,
      [userId]
    );

    const stepRows = rows
      .filter((r) => r.metric_type === 'steps')
      .sort((a, b) => b.local_date.localeCompare(a.local_date))
      .slice(0, 10);
    console.log(
      `[rollup] steps by date (newest first): ` +
        stepRows.map((r) => `${r.local_date}=${Math.round(r.value)}`).join('  ')
    );

    const hrvDates = rows
      .filter((r) => r.metric_type === 'hrv')
      .map((r) => r.local_date)
      .sort();
    console.log(
      `[rollup] health_records: ${rows.length} rows, hrv on ${hrvDates.length} dates: ${hrvDates.join(', ')}`
    );

    const byDate = new Map<string, Record<string, number>>();
    for (const row of rows) {
      const entry = byDate.get(row.local_date) ?? {};
      // Latest write wins per (date, metric); weight can have several per day.
      entry[row.metric_type] = row.value;
      byDate.set(row.local_date, entry);
    }

    const sleepRows = await db.getAllAsync<{
      local_date: string;
      asleep: number;
    }>(
      `SELECT local_date,
              MAX(light_min + deep_min + rem_min) AS asleep
       FROM health_sleep_sessions
       WHERE user_id = ?
       GROUP BY local_date`,
      [userId]
    );

    for (const row of sleepRows) {
      const entry = byDate.get(row.local_date) ?? {};
      entry.sleep_duration = row.asleep;
      byDate.set(row.local_date, entry);
    }

    // Batched for the same reason as the other loops in this file: one
    // transaction instead of one implicit transaction per row. Queued via
    // runInTransaction so it cannot overlap another write transaction.
    await database.runInTransaction(async (db) => {
    for (const [localDate, metrics] of byDate) {
      await db.runAsync(
        `INSERT INTO health_daily_metrics
           (user_id, local_date, hrv_ms, resting_hr, sleep_duration_min,
            steps, distance_km, active_calories, total_calories, weight_kg, zone_minutes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(user_id, local_date) DO UPDATE SET
           -- Overwrite rather than COALESCE. This rollup reads the whole of
           -- health_records every run, so the incoming value is always the
           -- authoritative one. Preserving the old value on a NULL meant a
           -- figure could only ever grow: once a wrong number was stored, a
           -- corrected (or legitimately smaller) reading could never replace it.
           hrv_ms = excluded.hrv_ms,
           resting_hr = excluded.resting_hr,
           sleep_duration_min = excluded.sleep_duration_min,
           steps = excluded.steps,
           distance_km = excluded.distance_km,
           active_calories = excluded.active_calories,
           total_calories = excluded.total_calories,
           -- Weight is the exception: it is carried forward across days that
           -- have no weigh-in, so a NULL here must not erase it.
           weight_kg = COALESCE(excluded.weight_kg, health_daily_metrics.weight_kg),
           zone_minutes = excluded.zone_minutes`,
        [
          userId,
          localDate,
          metrics.hrv ?? null,
          metrics.resting_hr ?? null,
          metrics.sleep_duration ?? null,
          metrics.steps ?? null,
          metrics.distance ?? null,
          metrics.active_calories ?? null,
          metrics.total_calories ?? null,
          metrics.weight ?? null,
          metrics.exercise ?? null,
        ]
      );
    }
    }, 'rollUpDailyMetrics');

    await this.carryForwardWeight(userId);
  }

  /**
   * Weight is only recorded on days the user actually steps on a scale, which
   * for most people is every few days. Without this, the weight tile and trend
   * would read "--" on the majority of days. Fill the gaps with the most recent
   * earlier reading so weight behaves like a standing value rather than an event.
   */
  private static async carryForwardWeight(userId: number) {
    const db = await database.getDatabase();

    const rows = await db.getAllAsync<{ local_date: string; weight_kg: number | null }>(
      `SELECT local_date, weight_kg
       FROM health_daily_metrics
       WHERE user_id = ?
       ORDER BY local_date ASC`,
      [userId]
    );

    // Collect first, write once — see computeScores for why per-row writes are
    // too slow to run from a button tap.
    const fills: [number, string][] = [];
    let lastKnown: number | null = null;
    for (const row of rows) {
      if (row.weight_kg != null) {
        lastKnown = row.weight_kg;
      } else if (lastKnown != null) {
        fills.push([lastKnown, row.local_date]);
      }
    }

    if (fills.length > 0) {
      await database.runInTransaction(async (db) => {
        for (const [kg, localDate] of fills) {
          await db.runAsync(
            `UPDATE health_daily_metrics SET weight_kg = ?
             WHERE user_id = ? AND local_date = ? AND weight_kg IS NULL`,
            [kg, userId, localDate]
          );
        }
      }, 'carryForwardWeight');
    }
  }

  /**
   * Rolling baseline.
   *
   * Two windows, deliberately different lengths:
   * - The central tendency uses a 7-day rolling mean, the interval established in
   *   athlete monitoring as sufficient to average out day-to-day noise.
   * - The SD (which defines the Smallest Worthwhile Change) uses 30 days, since a
   *   week is too few points for a stable spread estimate.
   *
   * HRV is handled as ln(RMSSD) throughout: RMSSD is right-skewed, and the log
   * transform is the standard normalising treatment in the HRV literature.
   * Readings beyond 3 SD are dropped so one corrupt night can't move the baseline.
   */
  private static async recomputeBaseline(userId: number): Promise<HealthBaselineSummary> {
    const db = await database.getDatabase();

    const rows = await db.getAllAsync<{
      local_date: string;
      hrv_ms: number | null;
      resting_hr: number | null;
      sleep_duration_min: number | null;
    }>(
      `SELECT local_date, hrv_ms, resting_hr, sleep_duration_min
       FROM health_daily_metrics
       WHERE user_id = ?
       ORDER BY local_date DESC
       LIMIT ?`,
      [userId, VARIABILITY_WINDOW_DAYS]
    );

    // Ascending, so "the last 7" means the 7 most recent days.
    const chronological = [...rows].reverse();

    const rejectOutliers = (values: number[]) => {
      if (values.length < 3) return values;
      const avg = mean(values);
      const sd = stdDev(values, avg);
      if (sd === 0) return values;
      return values.filter((v) => Math.abs(v - avg) <= 3 * sd);
    };

    // ln(RMSSD) — normalises the skew before any averaging happens.
    const hrvLnValues = rejectOutliers(
      chronological
        .map((r) => r.hrv_ms)
        .filter((v): v is number => v != null && v > 0)
        .map((v) => Math.log(v))
    );
    const rhrValues = rejectOutliers(
      chronological.map((r) => r.resting_hr).filter((v): v is number => v != null)
    );
    const sleepValues = rejectOutliers(
      chronological
        .map((r) => r.sleep_duration_min)
        .filter((v): v is number => v != null)
    );

    // 7-day rolling mean for the baseline; full window for the spread.
    const recent = <T>(values: T[]) => values.slice(-BASELINE_WINDOW_DAYS);

    const hrvLnMean = mean(recent(hrvLnValues));
    const rhrMean = mean(recent(rhrValues));
    const sleepMean = mean(recent(sleepValues));

    const hrvLnSd = stdDev(hrvLnValues, mean(hrvLnValues));
    const rhrSd = stdDev(rhrValues, mean(rhrValues));

    // Sample days = days with at least one of the two recovery inputs.
    const sampleDays = chronological.filter(
      (r) => r.hrv_ms != null || r.resting_hr != null
    ).length;

    const summary: HealthBaselineSummary = {
      // Stored in ln space; exposed in ms for display via hrvMeanMs.
      hrvMean: hrvLnMean,
      hrvSd: hrvLnSd,
      hrvMeanMs: hrvLnValues.length > 0 ? Math.exp(hrvLnMean) : 0,
      rhrMean,
      rhrSd,
      sleepDurationMean: sleepMean,
      sampleDays,
      ready: sampleDays >= MIN_BASELINE_DAYS,
    };

    await db.runAsync(
      `INSERT INTO health_baselines
         (user_id, hrv_mean, hrv_sd, rhr_mean, rhr_sd, sleep_duration_mean, sample_days, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         hrv_mean = excluded.hrv_mean,
         hrv_sd = excluded.hrv_sd,
         rhr_mean = excluded.rhr_mean,
         rhr_sd = excluded.rhr_sd,
         sleep_duration_mean = excluded.sleep_duration_mean,
         sample_days = excluded.sample_days,
         updated_at = excluded.updated_at`,
      [
        userId,
        summary.hrvMean,
        summary.hrvSd,
        summary.rhrMean,
        summary.rhrSd,
        summary.sleepDurationMean,
        summary.sampleDays,
        new Date().toISOString(),
      ]
    );

    return summary;
  }

  static async getBaseline(): Promise<HealthBaselineSummary | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;
      const row = await db.getFirstAsync<{
        hrv_mean: number;
        hrv_sd: number;
        rhr_mean: number;
        rhr_sd: number;
        sleep_duration_mean: number;
        sample_days: number;
      }>('SELECT * FROM health_baselines WHERE user_id = ?', [user.id]);
      if (!row) return null;
      return {
        // hrv_mean is persisted in ln space; back-transform for display.
        hrvMean: row.hrv_mean,
        hrvSd: row.hrv_sd,
        hrvMeanMs: row.hrv_mean > 0 ? Math.exp(row.hrv_mean) : 0,
        rhrMean: row.rhr_mean,
        rhrSd: row.rhr_sd,
        sleepDurationMean: row.sleep_duration_mean,
        sampleDays: row.sample_days,
        ready: row.sample_days >= MIN_BASELINE_DAYS,
      };
    } catch {
      return null;
    }
  }

  /**
   * Sleep need for a date.
   *
   * Baseline is the user's stated goal when they've set one, otherwise the
   * National Sleep Foundation recommendation for their age band (falling back to
   * the adult 8h midpoint when age is unknown). Recent debt and yesterday's
   * training are then added on top.
   */
  private static computeSleepNeed(
    localDate: string,
    priorSleep: { local_date: string; sleep_duration_min: number | null }[],
    baseNeedMin: number,
    workoutDates: Set<string>
  ): number {
    // Shortfall across the previous 3 days, half of which carries forward.
    const recent = priorSleep
      .filter((r) => r.local_date < localDate)
      .slice(0, 3)
      .map((r) => r.sleep_duration_min)
      .filter((v): v is number => v != null);

    const debt = recent.reduce(
      (sum, actual) => sum + Math.max(0, baseNeedMin - actual),
      0
    );
    const debtComponent = Math.min(MAX_SLEEP_DEBT_MIN, debt * 0.5);

    // A workout the day before raises the need — this is where the health tab
    // connects back to the app's own workout tracking. Dates are pre-fetched by
    // the caller: querying per day meant 60 sequential round-trips, which
    // blocked the UI thread long enough to look like a freeze.
    const yesterday = new Date(localDate);
    yesterday.setDate(yesterday.getDate() - 1);
    const strainComponent = workoutDates.has(getLocalDateString(yesterday))
      ? WORKOUT_SLEEP_BONUS_MIN
      : 0;

    return baseNeedMin + debtComponent + strainComponent;
  }

  private static async computeScores(userId: number, baseline: HealthBaselineSummary) {
    const db = await database.getDatabase();

    // Personal sleep target if set, else the NSF recommendation for their age.
    const profile = await HealthProfileService.getProfile();
    const baseNeedMin = profile.sleepGoalMin;

    const rows = await db.getAllAsync<{
      local_date: string;
      hrv_ms: number | null;
      resting_hr: number | null;
      sleep_duration_min: number | null;
    }>(
      `SELECT local_date, hrv_ms, resting_hr, sleep_duration_min
       FROM health_daily_metrics
       WHERE user_id = ?
       ORDER BY local_date DESC
       LIMIT 60`,
      [userId]
    );

    // Fetch every relevant workout date in one query rather than once per day.
    const workoutRows = await db
      .getAllAsync<{ workout_date: string }>(
        `SELECT DISTINCT workout_date FROM workouts
         WHERE user_id = ? AND status = 'completed'`,
        [userId]
      )
      .catch(() => [] as { workout_date: string }[]);
    const workoutDates = new Set(workoutRows.map((r) => r.workout_date));

    const updates: (string | number | null)[][] = [];
    const now = new Date().toISOString();

    for (const row of rows) {
      // Sleep performance is independent of the baseline, so compute it even
      // while the baseline is still filling up.
      let sleepPerformance: number | null = null;
      let sleepNeed: number | null = null;

      if (row.sleep_duration_min != null) {
        sleepNeed = this.computeSleepNeed(
          row.local_date,
          rows,
          baseNeedMin,
          workoutDates
        );
        sleepPerformance = clamp(
          Math.round((row.sleep_duration_min / sleepNeed) * 100),
          1,
          100
        );
      }

      let recovery: number | null = null;
      let band: ScoreBand | null = null;
      let estimated = 0;

      if (baseline.ready) {
        const terms: { weight: number; z: number }[] = [];

        if (row.hrv_ms != null && row.hrv_ms > 0 && baseline.hrvSd > 0) {
          // Compare in ln space, where the baseline lives. Expressed in SWC
          // units (0.5 x SD): +/-1 SWC is the smallest change worth reacting to.
          const swc = SWC_MULTIPLIER * baseline.hrvSd;
          terms.push({
            weight: RECOVERY_WEIGHTS.hrv,
            z: clamp((Math.log(row.hrv_ms) - baseline.hrvMean) / swc, -3, 3),
          });
        } else {
          estimated = 1; // no HRV — the dominant term is missing
        }

        if (row.resting_hr != null && baseline.rhrSd > 0) {
          const swc = SWC_MULTIPLIER * baseline.rhrSd;
          terms.push({
            weight: RECOVERY_WEIGHTS.rhr,
            // Sign flipped: a lower resting heart rate is better.
            z: clamp((baseline.rhrMean - row.resting_hr) / swc, -3, 3),
          });
        }

        if (sleepPerformance != null) {
          terms.push({
            weight: RECOVERY_WEIGHTS.sleep,
            // Anchored at normal adult sleep efficiency (~85%) from pooled
            // polysomnography norms; 15 points of spread maps to ~1 SD.
            z: clamp((sleepPerformance - NORMAL_SLEEP_EFFICIENCY) / 15, -3, 3),
          });
        }

        const totalWeight = terms.reduce((sum, t) => sum + t.weight, 0);
        if (totalWeight > 0) {
          // Renormalise so a missing input shifts weight to what we do have
          // rather than silently dragging the score toward neutral.
          const zTotal = terms.reduce((sum, t) => sum + (t.weight / totalWeight) * t.z, 0);
          recovery = clamp(
            Math.round(100 / (1 + Math.exp(-RECOVERY_SLOPE * zTotal))),
            1,
            99
          );
          band = bandForScore(recovery).band;
        }
      }

      updates.push([
        sleepNeed,
        sleepPerformance,
        recovery,
        band,
        estimated,
        now,
        userId,
        row.local_date,
      ]);
    }

    // One transaction rather than 60 separate writes. Each individual runAsync
    // is its own implicit transaction with its own fsync, which is what made a
    // recompute slow enough to freeze the screen when triggered from a tap.
    if (updates.length > 0) {
      await database.runInTransaction(async (db) => {
        for (const params of updates) {
          await db.runAsync(
            `UPDATE health_daily_metrics
             SET sleep_need_min = ?,
                 sleep_performance = ?,
                 recovery_score = ?,
                 recovery_band = ?,
                 recovery_estimated = ?,
                 computed_at = ?
             WHERE user_id = ? AND local_date = ?`,
            params
          );
        }
      }, 'computeScores');
    }
  }

  /** Weekly cardio load — sum of the last 7 days of TRIMP-style per-day load. */
  static async getWeeklyCardioLoad(): Promise<number | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 7);

      const row = await db.getFirstAsync<{ total: number | null }>(
        `SELECT SUM(cardio_load) as total
         FROM health_daily_metrics
         WHERE user_id = ? AND local_date >= ?`,
        [user.id, getLocalDateString(cutoff)]
      );
      return row?.total ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Pearson correlation between recovery and a handful of candidate drivers.
   * Rendered as a ranked list rather than a scatter — far more legible on a phone.
   */
  static async getCorrelations(): Promise<
    { label: string; r: number; strength: string }[]
  > {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];

      const rows = await db.getAllAsync<{
        recovery_score: number | null;
        sleep_duration_min: number | null;
        steps: number | null;
        sleep_performance: number | null;
      }>(
        `SELECT recovery_score, sleep_duration_min, steps, sleep_performance
         FROM health_daily_metrics
         WHERE user_id = ? AND recovery_score IS NOT NULL
         ORDER BY local_date DESC
         LIMIT 60`,
        [user.id]
      );

      const pearson = (pairs: [number, number][]): number | null => {
        if (pairs.length < 14) return null; // too few paired days to mean anything
        const xs = pairs.map((p) => p[0]);
        const ys = pairs.map((p) => p[1]);
        const mx = mean(xs);
        const my = mean(ys);
        const num = pairs.reduce((s, [x, y]) => s + (x - mx) * (y - my), 0);
        const den = Math.sqrt(
          xs.reduce((s, x) => s + (x - mx) ** 2, 0) *
            ys.reduce((s, y) => s + (y - my) ** 2, 0)
        );
        return den === 0 ? null : num / den;
      };

      const build = (
        label: string,
        pick: (r: (typeof rows)[number]) => number | null
      ) => {
        const pairs = rows
          .map((r) => [pick(r), r.recovery_score] as [number | null, number | null])
          .filter((p): p is [number, number] => p[0] != null && p[1] != null);
        const r = pearson(pairs);
        if (r === null) return null;
        const abs = Math.abs(r);
        const strength = abs >= 0.5 ? 'strong' : abs >= 0.3 ? 'moderate' : 'weak';
        return { label, r, strength };
      };

      return [
        build('SLEEP DURATION', (r) => r.sleep_duration_min),
        build('SLEEP PERFORMANCE', (r) => r.sleep_performance),
        build('STEPS', (r) => r.steps),
      ]
        .filter((c): c is { label: string; r: number; strength: string } => c !== null)
        .sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    } catch {
      return [];
    }
  }

  /**
   * The day the dashboard should show.
   *
   * Anchored to today when a row exists, otherwise the most recent day that is
   * not in the future. Some sources write sleep against tomorrow's date, and
   * taking a plain MAX(local_date) would mix that row's sleep with a different
   * day's steps — showing two days as though they were one.
   */
  static async getTodayMetrics(): Promise<HealthDailyMetrics | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;

      const today = getTodayLocal();

      const todayRow = await db.getFirstAsync<HealthDailyMetrics>(
        'SELECT * FROM health_daily_metrics WHERE user_id = ? AND local_date = ?',
        [user.id, today]
      );
      if (todayRow) return todayRow;

      return await db.getFirstAsync<HealthDailyMetrics>(
        `SELECT * FROM health_daily_metrics
         WHERE user_id = ? AND local_date <= ?
         ORDER BY local_date DESC
         LIMIT 1`,
        [user.id, today]
      );
    } catch {
      return null;
    }
  }

  /**
   * This week's averages against last week's, for the trend deltas.
   * Days without a value are skipped rather than counted as zero.
   */
  static async getWeeklyComparison(): Promise<{
    thisWeek: Record<string, number | null>;
    lastWeek: Record<string, number | null>;
    delta: Record<string, number | null>;
    /** Days with a value in each window, so the UI can distinguish "no change"
     *  from "nothing to compare against". */
    thisWeekDays: Record<string, number>;
    lastWeekDays: Record<string, number>;
  }> {
    const empty = {
      thisWeek: {},
      lastWeek: {},
      delta: {},
      thisWeekDays: {},
      lastWeekDays: {},
    };
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return empty;

      // Inclusive 7-day windows. The previous version used a strict `>` on the
      // lower bound with today as the upper bound, which excluded today and
      // returned nothing at all when only a couple of days had been synced.
      const now = new Date();
      const dayOffset = (days: number) => {
        const d = new Date(now);
        d.setDate(now.getDate() - days);
        return getLocalDateString(d);
      };

      const fields = [
        'recovery_score',
        'sleep_performance',
        'sleep_duration_min',
        'hrv_ms',
        'resting_hr',
        'steps',
        'distance_km',
        'total_calories',
        'active_calories',
        'weight_kg',
      ] as const;

      // COUNT alongside AVG: a null average and "no days recorded" look the same
      // in the result otherwise, and the UI needs to tell them apart.
      const avgFor = async (fromDate: string, toDate: string) => {
        const selects = fields
          .map((f) => `AVG(${f}) as ${f}, COUNT(${f}) as ${f}__n`)
          .join(', ');
        const row = await db.getFirstAsync<Record<string, number | null>>(
          `SELECT ${selects} FROM health_daily_metrics
           WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
          [user.id, fromDate, toDate]
        );

        const averages: Record<string, number | null> = {};
        const counts: Record<string, number> = {};
        for (const f of fields) {
          averages[f] = row?.[f] ?? null;
          counts[f] = (row?.[`${f}__n`] as number | null) ?? 0;
        }
        return { averages, counts };
      };

      const current = await avgFor(dayOffset(6), dayOffset(0));
      const previous = await avgFor(dayOffset(13), dayOffset(7));

      const delta: Record<string, number | null> = {};
      for (const f of fields) {
        const a = current.averages[f];
        const b = previous.averages[f];
        delta[f] = a != null && b != null && b !== 0 ? ((a - b) / b) * 100 : null;
      }

      return {
        thisWeek: current.averages,
        lastWeek: previous.averages,
        delta,
        thisWeekDays: current.counts,
        lastWeekDays: previous.counts,
      };
    } catch {
      return empty;
    }
  }

  /**
   * All-time totals. Every other aggregate here is windowed to 7-30 days; this
   * is the only one that spans the whole local cache, which keeps accumulating
   * well past the 30 days Health Connect itself will serve.
   */
  static async getLifetimeTotals(): Promise<{
    distanceKm: number;
    steps: number;
    daysTracked: number;
    firstDate: string | null;
  }> {
    const empty = { distanceKm: 0, steps: 0, daysTracked: 0, firstDate: null };
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return empty;

      const row = await db.getFirstAsync<{
        distance_km: number | null;
        steps: number | null;
        days: number | null;
        first_date: string | null;
      }>(
        `SELECT SUM(distance_km) as distance_km,
                SUM(steps) as steps,
                COUNT(*) as days,
                MIN(local_date) as first_date
         FROM health_daily_metrics
         WHERE user_id = ?`,
        [user.id]
      );

      return {
        distanceKm: row?.distance_km ?? 0,
        steps: row?.steps ?? 0,
        daysTracked: row?.days ?? 0,
        firstDate: row?.first_date ?? null,
      };
    } catch {
      return empty;
    }
  }

  /** Average steps over the last 7 days, for the summary tile. */
  static async getWeeklyAverageSteps(): Promise<number | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;
      const from = new Date();
      from.setDate(from.getDate() - 6);
      const row = await db.getFirstAsync<{ avg: number | null }>(
        `SELECT AVG(steps) as avg FROM health_daily_metrics
         WHERE user_id = ? AND local_date >= ? AND steps IS NOT NULL`,
        [user.id, getLocalDateString(from)]
      );
      return row?.avg ?? null;
    } catch {
      return null;
    }
  }

  /** Per-metric series for the trend charts, oldest first. */
  static async getTrendSeries(
    days = 30
  ): Promise<Record<string, { date: string; value: number }[]>> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return {};

      // Filter by DATE, not row count. LIMIT caps rows, and rows only exist for
      // days that have data — so "90 days" was returning the 90 most recent
      // records, which could span any number of calendar days. With fewer than
      // 30 days of history every range returned an identical result.
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - (days - 1));

      const rows = await db.getAllAsync<HealthDailyMetrics>(
        `SELECT * FROM health_daily_metrics
         WHERE user_id = ? AND local_date >= ?
         ORDER BY local_date DESC`,
        [user.id, getLocalDateString(cutoff)]
      );

      const chronological = [...rows].reverse();
      const series: Record<string, { date: string; value: number }[]> = {};

      const collect = (key: string, pick: (r: HealthDailyMetrics) => number | null | undefined) => {
        series[key] = chronological
          .map((r) => ({ date: r.local_date, value: pick(r) }))
          .filter((p): p is { date: string; value: number } => p.value != null);
      };

      collect('recovery', (r) => r.recovery_score);
      collect('hrv', (r) => r.hrv_ms);
      collect('rhr', (r) => r.resting_hr);
      collect('sleep', (r) => r.sleep_duration_min);
      collect('sleepPerformance', (r) => r.sleep_performance);
      collect('steps', (r) => r.steps);
      collect('distance', (r) => r.distance_km);
      collect('zoneMinutes', (r) => r.zone_minutes);
      collect('weight', (r) => r.weight_kg);
      collect('activeCalories', (r) => r.active_calories);
      collect('totalCalories', (r) => r.total_calories);

      return series;
    } catch {
      return {};
    }
  }

  /**
   * Sleep consistency: how tightly bedtimes and wake times cluster, expressed
   * 0-100. Regularity is one of the strongest predictors of sleep quality, and
   * it's derivable from data we already store.
   */
  static async getSleepConsistency(): Promise<{
    score: number | null;
    avgBedtime: string | null;
    avgWakeTime: string | null;
    nights: number;
  }> {
    const empty = { score: null, avgBedtime: null, avgWakeTime: null, nights: 0 };
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return empty;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 14);

      const rows = await db.getAllAsync<{ start_time: string; end_time: string }>(
        `SELECT start_time, end_time FROM health_sleep_sessions
         WHERE user_id = ? AND local_date >= ?
         ORDER BY start_time ASC`,
        [user.id, getLocalDateString(cutoff)]
      );

      if (rows.length < 3) return { ...empty, nights: rows.length };

      // Bedtimes straddle midnight, so shift late-evening times negative to keep
      // 23:30 and 00:30 adjacent instead of 24 hours apart.
      const toMinutes = (iso: string, wrapEvening: boolean) => {
        const d = new Date(iso);
        const mins = d.getHours() * 60 + d.getMinutes();
        return wrapEvening && mins > 12 * 60 ? mins - 24 * 60 : mins;
      };

      const bedtimes = rows.map((r) => toMinutes(r.start_time, true));
      const waketimes = rows.map((r) => toMinutes(r.end_time, false));

      const bedMean = mean(bedtimes);
      const wakeMean = mean(waketimes);
      const bedSd = stdDev(bedtimes, bedMean);
      const wakeSd = stdDev(waketimes, wakeMean);

      // 0 SD = perfectly regular (100); 90+ min of drift trends toward 0.
      const consistency = clamp(
        Math.round(100 - ((bedSd + wakeSd) / 2 / 90) * 100),
        1,
        100
      );

      const fmt = (mins: number) => {
        const normalized = ((Math.round(mins) % 1440) + 1440) % 1440;
        const h = Math.floor(normalized / 60);
        const m = normalized % 60;
        const suffix = h >= 12 ? 'PM' : 'AM';
        const h12 = h % 12 === 0 ? 12 : h % 12;
        return `${h12}:${m.toString().padStart(2, '0')} ${suffix}`;
      };

      return {
        score: consistency,
        avgBedtime: fmt(bedMean),
        avgWakeTime: fmt(wakeMean),
        nights: rows.length,
      };
    } catch {
      return empty;
    }
  }

  /**
   * Record a weight entry manually.
   *
   * Written into health_records under a synthetic id so it flows through the
   * same rollup as Health Connect data. Logging again on the same day replaces
   * that day's value rather than adding a second one.
   */
  static async logWeight(kg: number, localDate?: string): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const date = localDate ?? getTodayLocal();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO health_records
         (user_id, hc_record_id, metric_type, value, unit, start_time, end_time,
          local_date, data_origin, hc_last_modified)
       VALUES (?, ?, 'weight', ?, 'kg', ?, ?, ?, 'manual', ?)
       ON CONFLICT(hc_record_id, metric_type) DO UPDATE SET
         value = excluded.value,
         hc_last_modified = excluded.hc_last_modified`,
      [user.id, `manual-weight-${date}`, kg, date, date, date, now]
    );

    // Write the day's value directly so the UI can update immediately. A full
    // recomputeAll here made the save block on a 60-day rescore, which read as
    // a frozen screen; the caller schedules that separately.
    await db.runAsync(
      `INSERT INTO health_daily_metrics (user_id, local_date, weight_kg)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, local_date) DO UPDATE SET weight_kg = excluded.weight_kg`,
      [user.id, date, kg]
    );
  }

  /**
   * Fill forward weight and refresh scores after a manual entry.
   *
   * Split out from logWeight so the UI can save-and-return instantly and let
   * this run afterwards without blocking the tap.
   */
  static async refreshAfterWeightLog(): Promise<void> {
    try {
      const user = await UserService.getCurrentUser();
      if (!user) return;
      await this.carryForwardWeight(user.id);
    } catch {
      // Non-critical: the logged value is already saved and displayed.
    }
  }

  /** Most recent weight entry, whatever its source. */
  static async getLatestWeight(): Promise<{ kg: number; date: string } | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;
      const row = await db.getFirstAsync<{ value: number; local_date: string }>(
        `SELECT value, local_date FROM health_records
         WHERE user_id = ? AND metric_type = 'weight'
         ORDER BY local_date DESC
         LIMIT 1`,
        [user.id]
      );
      return row ? { kg: row.value, date: row.local_date } : null;
    } catch {
      return null;
    }
  }

  /** Last 7 nights of stage totals, for the sleep breakdown. */
  static async getRecentSleepNights(limit = 7): Promise<
    {
      local_date: string;
      awake_min: number;
      light_min: number;
      deep_min: number;
      rem_min: number;
      total_duration_min: number;
    }[]
  > {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];
      const rows = await db.getAllAsync<{
        local_date: string;
        awake_min: number;
        light_min: number;
        deep_min: number;
        rem_min: number;
        total_duration_min: number;
      }>(
        // Sum per night: naps and fragmented sessions produce several rows for
        // one date, which previously yielded duplicate React keys.
        `SELECT local_date,
                SUM(awake_min) AS awake_min,
                SUM(light_min) AS light_min,
                SUM(deep_min) AS deep_min,
                SUM(rem_min) AS rem_min,
                SUM(total_duration_min) AS total_duration_min
         FROM health_sleep_sessions
         WHERE user_id = ?
         GROUP BY local_date
         ORDER BY local_date DESC
         LIMIT ?`,
        [user.id, limit]
      );
      return [...rows].reverse();
    } catch {
      return [];
    }
  }
}
