import { database, Skip } from '@/database/database';
import { UserService } from './UserService';
import { HealthScoreService, type HealthBaselineSummary } from './HealthScoreService';
import { getExcuse, type ExcuseCategory } from '@/constants/excuses';
import { getLocalDateString, parseLocalDateString } from '@/utils/dateUtils';

/**
 * The Lab: experimental analysis of the user's own excuses.
 *
 * Everything here is computed on the device from data already stored — no
 * network, no new tracking. Results are derived on every load rather than
 * persisted, so a late Health Connect sync retroactively improves old verdicts.
 */

export type Verdict = 'backed' | 'disputed' | 'inconclusive' | 'no_data' | 'not_checkable';

export interface FactCheck {
  skip: Skip;
  verdict: Verdict;
  /** One line of evidence, e.g. "Slept 8h 12m · 84% recovery". */
  evidence: string;
}

export interface WeekdayStat {
  /** 0 = Sunday, matching Date.getDay(). */
  day: number;
  skips: number;
  workouts: number;
  /** Share of that weekday's sessions that were skipped, 0-1; null with no sessions. */
  skipRate: number | null;
}

export type TimeSlot = 'morning' | 'afternoon' | 'evening';

export interface LabReport {
  totalSkips: number;
  totalWorkouts: number;
  factChecks: FactCheck[];
  honesty: { backed: number; disputed: number; score: number | null };
  categoryMix: Record<ExcuseCategory, number>;
  breakdown: { excuse: string; count: number }[];
  weekdays: WeekdayStat[];
  /** The weekday with the highest skip rate, when it stands out. */
  weakDay: WeekdayStat | null;
  timeSlots: Record<TimeSlot, { skips: number; workouts: number }>;
  weakSlot: TimeSlot | null;
  /** Average sleep the night before skips vs. before workouts, in minutes. */
  leadUpSleep: { beforeSkip: number; beforeWorkout: number } | null;
  /** Skips logged on the day vs. logged afterwards on the missed-workout screen. */
  timing: { ahead: number; afterTheFact: number };
  /** Average days from a skip to the next verified workout. */
  comebackDays: number | null;
  /** Skips in the last 30 days vs. the 30 before. */
  trend: { recent: number; previous: number };
}

/** Raw rows shared by the Lab report and the achievement checks. */
export interface LabData {
  skips: Skip[];
  workouts: { workout_date: string; started_at: string | null; duration: number | null; activity?: string | null }[];
  metrics: Map<string, DayMetrics>;
  exerciseDates: Set<string>;
  stress: Map<string, number>;
  baseline: HealthBaselineSummary | null;
}

interface DayMetrics {
  sleep_duration_min: number | null;
  recovery_score: number | null;
  resting_hr: number | null;
  hrv_ms: number | null;
  steps: number | null;
}

/** Fewer skips than this and patterns are noise, so they are not shown. */
export const MIN_SKIPS_FOR_PATTERNS = 3;

export const addDays = (date: string, days: number): string => {
  const d = parseLocalDateString(date);
  d.setDate(d.getDate() + days);
  return getLocalDateString(d);
};

export const weekdayOf = (date: string): number => parseLocalDateString(date).getDay();

/** SQLite CURRENT_TIMESTAMP is UTC without a zone marker. */
const parseSqliteUtc = (value: string): Date =>
  new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');

const slotForHour = (hour: number): TimeSlot =>
  hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening';

export const formatMinutes = (min: number): string => {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const mean = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;

export class LabService {
  static async loadData(): Promise<LabData> {
    const empty: LabData = {
      skips: [],
      workouts: [],
      metrics: new Map(),
      exerciseDates: new Set(),
      stress: new Map(),
      baseline: null,
    };

    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return empty;

    const skips = await db.getAllAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? ORDER BY skip_date DESC',
      [user.id]
    );
    const workouts = await db.getAllAsync<LabData['workouts'][number]>(
      `SELECT workout_date, started_at, duration, activity FROM workouts
       WHERE user_id = ? AND verified = 1 AND status = 'completed'
       ORDER BY workout_date ASC`,
      [user.id]
    );

    // Health tables can be empty (no Health Connect, or the web build) — the
    // Lab still works on skips and workouts alone, so failures are swallowed.
    const metrics = new Map<string, DayMetrics>();
    try {
      const rows = await db.getAllAsync<DayMetrics & { local_date: string }>(
        `SELECT local_date, sleep_duration_min, recovery_score, resting_hr, hrv_ms, steps
         FROM health_daily_metrics WHERE user_id = ?`,
        [user.id]
      );
      for (const r of rows) metrics.set(r.local_date, r);
    } catch {}

    const exerciseDates = new Set<string>();
    try {
      const rows = await db.getAllAsync<{ local_date: string }>(
        'SELECT DISTINCT local_date FROM health_exercise_sessions WHERE user_id = ?',
        [user.id]
      );
      for (const r of rows) exerciseDates.add(r.local_date);
    } catch {}

    const stress = new Map<string, number>();
    try {
      const rows = await db.getAllAsync<{ local_date: string; stress_level: number }>(
        'SELECT local_date, stress_level FROM daily_journal WHERE user_id = ? AND stress_level IS NOT NULL',
        [user.id]
      );
      for (const r of rows) stress.set(r.local_date, r.stress_level);
    } catch {}

    const baseline = await HealthScoreService.getBaseline().catch(() => null);

    return { skips, workouts, metrics, exerciseDates, stress, baseline };
  }

  static async getReport(): Promise<LabReport> {
    return this.buildReport(await this.loadData());
  }

  static buildReport(data: LabData): LabReport {
    const { skips, workouts } = data;

    const factChecks = skips.map((skip) => this.factCheck(skip, data));
    const backed = factChecks.filter((f) => f.verdict === 'backed').length;
    const disputed = factChecks.filter((f) => f.verdict === 'disputed').length;

    const categoryMix: Record<ExcuseCategory, number> = { external: 0, internal: 0, physical: 0 };
    const counts = new Map<string, number>();
    for (const s of skips) {
      categoryMix[getExcuse(s.excuse).category]++;
      counts.set(s.excuse, (counts.get(s.excuse) ?? 0) + 1);
    }
    const breakdown = [...counts.entries()]
      .map(([excuse, count]) => ({ excuse, count }))
      .sort((a, b) => b.count - a.count);

    // Weekdays: skip rate rather than raw count, so a day you train often isn't
    // flagged just for having more sessions.
    const weekdays: WeekdayStat[] = Array.from({ length: 7 }, (_, day) => ({
      day,
      skips: 0,
      workouts: 0,
      skipRate: null,
    }));
    for (const s of skips) weekdays[weekdayOf(s.skip_date)].skips++;
    for (const w of workouts) weekdays[weekdayOf(w.workout_date)].workouts++;
    for (const w of weekdays) {
      const total = w.skips + w.workouts;
      w.skipRate = total > 0 ? w.skips / total : null;
    }
    const overallRate = skips.length / Math.max(1, skips.length + workouts.length);
    const weakDay =
      skips.length >= MIN_SKIPS_FOR_PATTERNS
        ? [...weekdays]
            .filter((w) => w.skips >= 2 && (w.skipRate ?? 0) > overallRate * 1.25)
            .sort((a, b) => (b.skipRate ?? 0) - (a.skipRate ?? 0))[0] ?? null
        : null;

    const timeSlots: LabReport['timeSlots'] = {
      morning: { skips: 0, workouts: 0 },
      afternoon: { skips: 0, workouts: 0 },
      evening: { skips: 0, workouts: 0 },
    };
    for (const s of skips) {
      if (!s.scheduled_time) continue;
      const hour = parseInt(s.scheduled_time.split(':')[0], 10);
      if (!isNaN(hour)) timeSlots[slotForHour(hour)].skips++;
    }
    for (const w of workouts) {
      if (!w.started_at) continue;
      timeSlots[slotForHour(new Date(w.started_at).getHours())].workouts++;
    }
    const slotSkips = Object.values(timeSlots).reduce((s, t) => s + t.skips, 0);
    const slotTotal = Object.values(timeSlots).reduce((s, t) => s + t.skips + t.workouts, 0);
    const slotRate = slotTotal > 0 ? slotSkips / slotTotal : 0;
    const weakSlot =
      slotSkips >= MIN_SKIPS_FOR_PATTERNS
        ? ((Object.keys(timeSlots) as TimeSlot[])
            .filter((k) => {
              const t = timeSlots[k];
              return t.skips >= 2 && t.skips / (t.skips + t.workouts) > slotRate * 1.25;
            })
            .sort((a, b) => {
              const ra = timeSlots[a].skips / (timeSlots[a].skips + timeSlots[a].workouts);
              const rb = timeSlots[b].skips / (timeSlots[b].skips + timeSlots[b].workouts);
              return rb - ra;
            })[0] ?? null)
        : null;

    // Sleep is stored against the morning it ended, so the row for a date is
    // the night before that day's session.
    const sleepFor = (date: string) => data.metrics.get(date)?.sleep_duration_min ?? null;
    const skipSleep = skips.map((s) => sleepFor(s.skip_date)).filter((v): v is number => v != null);
    const workoutSleep = workouts
      .map((w) => sleepFor(w.workout_date))
      .filter((v): v is number => v != null);
    const leadUpSleep =
      skipSleep.length >= MIN_SKIPS_FOR_PATTERNS && workoutSleep.length >= MIN_SKIPS_FOR_PATTERNS
        ? { beforeSkip: mean(skipSleep), beforeWorkout: mean(workoutSleep) }
        : null;

    const timing = { ahead: 0, afterTheFact: 0 };
    for (const s of skips) {
      const loggedOn = getLocalDateString(parseSqliteUtc(s.created_at));
      if (loggedOn > s.skip_date) timing.afterTheFact++;
      else timing.ahead++;
    }

    const workoutDates = workouts.map((w) => w.workout_date);
    const gaps: number[] = [];
    for (const s of skips) {
      const next = workoutDates.find((d) => d > s.skip_date);
      if (!next) continue;
      const days = Math.round(
        (parseLocalDateString(next).getTime() - parseLocalDateString(s.skip_date).getTime()) /
          86400000
      );
      gaps.push(days);
    }

    const today = getLocalDateString(new Date());
    const d30 = addDays(today, -30);
    const d60 = addDays(today, -60);
    const trend = {
      recent: skips.filter((s) => s.skip_date > d30).length,
      previous: skips.filter((s) => s.skip_date > d60 && s.skip_date <= d30).length,
    };

    return {
      totalSkips: skips.length,
      totalWorkouts: workouts.length,
      factChecks,
      honesty: {
        backed,
        disputed,
        score: backed + disputed >= MIN_SKIPS_FOR_PATTERNS ? backed / (backed + disputed) : null,
      },
      categoryMix,
      breakdown,
      weekdays,
      weakDay,
      timeSlots,
      weakSlot,
      leadUpSleep,
      timing,
      comebackDays: gaps.length > 0 ? mean(gaps) : null,
      trend,
    };
  }

  /**
   * Check one excuse against the body's data for that day.
   *
   * Thresholds are deliberately conservative: "disputed" needs the data to
   * clearly contradict the excuse, and anything borderline is "inconclusive".
   */
  static factCheck(skip: Skip, data: LabData): FactCheck {
    const date = skip.skip_date;
    const m = data.metrics.get(date);
    const b = data.baseline?.ready ? data.baseline : null;
    const result = (verdict: Verdict, evidence: string): FactCheck => ({ skip, verdict, evidence });

    const rhrDelta =
      m?.resting_hr != null && b && b.rhrMean > 0 ? m.resting_hr - b.rhrMean : null;

    switch (getExcuse(skip.excuse).check) {
      case 'sleep': {
        const sleep = m?.sleep_duration_min ?? null;
        const rec = m?.recovery_score ?? null;
        if (sleep == null && rec == null) return result('no_data', 'No sleep data for that night');
        const parts = [
          sleep != null ? `Slept ${formatMinutes(sleep)}` : null,
          rec != null ? `${Math.round(rec)}% recovery` : null,
        ].filter(Boolean).join(' · ');

        const shortSleep =
          sleep != null && (sleep < 360 || (b != null && sleep < b.sleepDurationMean - 60));
        if (shortSleep || (rec != null && rec < 34)) return result('backed', parts);

        const restedSleep = sleep != null && sleep >= 420;
        const restedRecovery = rec == null ? sleep != null && sleep >= 450 : rec >= 67;
        if (restedSleep && restedRecovery) return result('disputed', parts);
        return result('inconclusive', parts);
      }

      case 'soreness': {
        const trainedOn = [1, 2]
          .map((n) => addDays(date, -n))
          .find(
            (d) =>
              data.workouts.some((w) => w.workout_date === d) || data.exerciseDates.has(d)
          );
        const rec = m?.recovery_score ?? null;
        if (rec != null && rec < 34) return result('backed', `Recovery in the red (${Math.round(rec)}%)`);
        if (trainedOn) {
          return result(
            'backed',
            trainedOn === addDays(date, -1) ? 'You trained the day before' : 'You trained 2 days before'
          );
        }
        const restedFor3 = [1, 2, 3]
          .map((n) => addDays(date, -n))
          .every((d) => !data.workouts.some((w) => w.workout_date === d) && !data.exerciseDates.has(d));
        if (restedFor3 && (rec == null || rec >= 67)) {
          return result('disputed', 'No training in the 3 days before. Sore from what?');
        }
        return result('inconclusive', rec != null ? `${Math.round(rec)}% recovery` : 'Mixed signals');
      }

      case 'activity': {
        const steps = m?.steps ?? null;
        if (steps == null) return result('no_data', 'No step data for that day');
        const label = `${Math.round(steps).toLocaleString()} steps`;
        if (steps >= 10000) return result('backed', `${label}. Busy on your feet`);
        if (steps < 3000) return result('disputed', `${label}. Busy on the couch?`);
        return result('inconclusive', label);
      }

      case 'stress': {
        const stress = data.stress.get(date);
        if (stress != null && stress >= 4) return result('backed', `Journal stress ${stress}/5`);
        if (rhrDelta != null && rhrDelta >= Math.max(b?.rhrSd ?? 0, 3)) {
          return result('backed', `Resting HR ${Math.round(rhrDelta)} bpm above your normal`);
        }
        if (stress == null && rhrDelta == null) return result('no_data', 'No stress or heart data');
        // Anxiety can't be disproven by a heart rate, so this never disputes.
        return result('inconclusive', 'No clear signal in your data');
      }

      case 'illness': {
        const hrvLow =
          m?.hrv_ms != null && m.hrv_ms > 0 && b && b.hrvSd > 0
            ? Math.log(m.hrv_ms) < b.hrvMean - b.hrvSd
            : false;
        if (rhrDelta != null && rhrDelta >= 3) {
          return result('backed', `Resting HR ${Math.round(rhrDelta)} bpm above your normal`);
        }
        if (hrvLow) return result('backed', 'HRV well below your baseline');
        if (rhrDelta == null && m?.hrv_ms == null) return result('no_data', 'No heart data for that day');
        // Plenty of illnesses don't move heart rate, so this never disputes.
        return result('inconclusive', 'No physical signal in your heart data');
      }

      default:
        return result('not_checkable', "The data can't see this one");
    }
  }
}
