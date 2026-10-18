import { database, ExperimentRow, ExperimentCheckin } from '@/database/database';
import { UserService } from './UserService';
import { LabService, addDays } from './LabService';
import { NotificationService } from './NotificationService';
import { getExcuse } from '@/constants/excuses';
import {
  BLOCK_COUNT,
  BLOCK_DAYS,
  EXPERIMENT_DAYS,
  EXPERIMENT_TEMPLATES,
  METRICS,
  MIN_COMPLIANCE,
  type ExperimentSignals,
  type ExperimentTemplate,
  type MetricId,
  type Suggestion,
} from '@/constants/experiments';
import { getTodayLocal } from '@/utils/dateUtils';

export type Phase = 'A' | 'B';
export type MetricVerdict = 'worked' | 'worse' | 'no_effect' | 'inconclusive';

export interface MetricResult {
  metric: MetricId;
  verdict: MetricVerdict;
  /** Mean on "rule on" (B) and "rule off" (A) days. */
  onMean: number | null;
  offMean: number | null;
  /** onMean - offMean, in the metric's unit. */
  diff: number | null;
  /** Smallest worthwhile change: half the day-to-day noise. */
  threshold: number | null;
  /** Welch's t statistic for on vs. off. */
  t: number | null;
  /** Both on-blocks beat both off-blocks in the better direction. */
  consistent: boolean;
  nOn: number;
  nOff: number;
  blockMeans: (number | null)[];
  reason: string;
}

export interface ExperimentResult {
  compliance: number;
  primary: MetricResult;
  secondary: MetricResult[];
  flags: string[];
  computedAt: string;
}

export interface Experiment extends Omit<ExperimentRow, 'secondary_metrics' | 'schedule' | 'result'> {
  primary_metric: MetricId;
  secondary_metrics: MetricId[];
  schedule: Phase[];
  result: ExperimentResult | null;
  endDate: string;
}

export interface LibraryEntry {
  template: ExperimentTemplate;
  available: boolean;
  /** Why it can't run yet, when unavailable. */
  missing: string | null;
  suggestion: Suggestion | null;
}

export interface NewExperimentInput {
  templateId: string;
  title: string;
  rule: string;
  offRule: string;
  hypothesis: string;
  primary: MetricId;
  secondary: MetricId[];
}

type MetricValues = Map<MetricId, Map<string, number>>;

const CHECKIN_HOUR = 21;
const NOTIFICATION_DAYS_AHEAD = 7;

const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : 0);
const variance = (v: number[], m: number) =>
  v.length > 1 ? v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1) : 0;

/** Circular spread (±minutes) of clock times, so 23:30 and 00:30 are an hour apart, not 23. */
const clockSpread = (minutesOfDay: number[]): number | null => {
  if (minutesOfDay.length < 7) return null;
  const angles = minutesOfDay.map((m) => (m / 1440) * 2 * Math.PI);
  const c = mean(angles.map(Math.cos));
  const s = mean(angles.map(Math.sin));
  const r = Math.min(1, Math.sqrt(c * c + s * s));
  if (r <= 0) return 720;
  return (Math.sqrt(-2 * Math.log(r)) / (2 * Math.PI)) * 1440;
};

const parse = (row: ExperimentRow): Experiment => ({
  ...row,
  primary_metric: row.primary_metric as MetricId,
  secondary_metrics: JSON.parse(row.secondary_metrics || '[]'),
  schedule: JSON.parse(row.schedule),
  result: row.result ? JSON.parse(row.result) : null,
  endDate: addDays(row.start_date, EXPERIMENT_DAYS - 1),
});

export class ExperimentService {
  // ------------------------------------------------------------------ data

  static async loadMetricValues(userId: number): Promise<MetricValues> {
    const db = await database.getDatabase();
    const values: MetricValues = new Map(
      (Object.keys(METRICS) as MetricId[]).map((id) => [id, new Map<string, number>()])
    );
    const put = (id: MetricId, date: string, v: number | null | undefined) => {
      if (v != null && !isNaN(v)) values.get(id)!.set(date, v);
    };

    try {
      const rows = await db.getAllAsync<{
        local_date: string;
        sleep_duration_min: number | null;
        sleep_performance: number | null;
        hrv_ms: number | null;
        resting_hr: number | null;
        recovery_score: number | null;
        steps: number | null;
      }>(
        `SELECT local_date, sleep_duration_min, sleep_performance, hrv_ms, resting_hr, recovery_score, steps
         FROM health_daily_metrics WHERE user_id = ?`,
        [userId]
      );
      for (const r of rows) {
        put('sleep_duration', r.local_date, r.sleep_duration_min);
        put('sleep_performance', r.local_date, r.sleep_performance);
        put('hrv', r.local_date, r.hrv_ms);
        put('resting_hr', r.local_date, r.resting_hr);
        put('recovery', r.local_date, r.recovery_score);
        put('steps', r.local_date, r.steps);
      }
    } catch {}

    try {
      // The main (longest) session per night; naps would skew stage totals.
      const rows = await db.getAllAsync<{
        local_date: string;
        deep_min: number;
        sleep_efficiency: number;
        total_duration_min: number;
      }>(
        `SELECT local_date, deep_min, sleep_efficiency, total_duration_min
         FROM health_sleep_sessions WHERE user_id = ? ORDER BY total_duration_min ASC`,
        [userId]
      );
      for (const r of rows) {
        if (r.deep_min > 0) put('deep_sleep', r.local_date, r.deep_min);
        if (r.sleep_efficiency > 0) put('sleep_efficiency', r.local_date, r.sleep_efficiency);
      }
    } catch {}

    try {
      const skips = await db.getAllAsync<{ d: string }>(
        'SELECT skip_date AS d FROM skips WHERE user_id = ?',
        [userId]
      );
      for (const s of skips) put('attendance', s.d, 0);
      const workouts = await db.getAllAsync<{ d: string }>(
        `SELECT workout_date AS d FROM workouts WHERE user_id = ? AND verified = 1 AND status = 'completed'`,
        [userId]
      );
      for (const w of workouts) put('attendance', w.d, 100);
    } catch {}

    try {
      const rows = await db.getAllAsync<{ local_date: string; stress_level: number }>(
        'SELECT local_date, stress_level FROM daily_journal WHERE user_id = ? AND stress_level IS NOT NULL',
        [userId]
      );
      for (const r of rows) put('stress', r.local_date, r.stress_level);
    } catch {}

    return values;
  }

  static async computeSignals(userId: number, values: MetricValues): Promise<ExperimentSignals> {
    const db = await database.getDatabase();
    const today = getTodayLocal();
    const since = addDays(today, -28);

    const lab = await LabService.loadData();
    const report = LabService.buildReport(lab);

    let journal: {
      local_date: string;
      caffeine_servings: number | null;
      alcohol_units: number | null;
      last_meal_time: string | null;
    }[] = [];
    try {
      journal = await db.getAllAsync(
        `SELECT local_date, caffeine_servings, alcohol_units, last_meal_time
         FROM daily_journal WHERE user_id = ? AND local_date > ?`,
        [userId, addDays(today, -60)]
      );
    } catch {}

    const caffeine = journal.map((j) => j.caffeine_servings).filter((v): v is number => v != null);
    const hrv = values.get('hrv')!;
    const drinkMornings: number[] = [];
    const soberMornings: number[] = [];
    for (const j of journal) {
      const next = hrv.get(addDays(j.local_date, 1));
      if (next == null || j.alcohol_units == null) continue;
      (j.alcohol_units >= 2 ? drinkMornings : soberMornings).push(next);
    }
    const hrvDropAfterDrinking =
      drinkMornings.length >= 2 && soberMornings.length >= 5 && mean(soberMornings) > 0
        ? ((mean(soberMornings) - mean(drinkMornings)) / mean(soberMornings)) * 100
        : null;

    let sessions: { start_time: string; end_time: string }[] = [];
    try {
      sessions = await db.getAllAsync(
        `SELECT start_time, end_time FROM health_sleep_sessions
         WHERE user_id = ? AND local_date > ? AND total_duration_min >= 180`,
        [userId, since]
      );
    } catch {}
    const toMin = (iso: string) => {
      const d = new Date(iso);
      return d.getHours() * 60 + d.getMinutes();
    };

    const recent = (id: MetricId) =>
      [...values.get(id)!.entries()].filter(([d]) => d > since).map(([, v]) => v);
    const avg = (v: number[]) => (v.length >= 5 ? mean(v) : null);

    const sessionsTotal = report.totalSkips + report.totalWorkouts;
    const skipsOf = (labels: string[]) => lab.skips.filter((s) => labels.includes(s.excuse)).length;

    return {
      avgCaffeine: caffeine.length >= 5 ? mean(caffeine) : null,
      alcoholDays: journal.filter((j) => (j.alcohol_units ?? 0) > 0).length,
      hrvDropAfterDrinking,
      bedtimeSpreadMin: clockSpread(sessions.map((s) => toMin(s.start_time))),
      wakeSpreadMin: clockSpread(sessions.map((s) => toMin(s.end_time))),
      lateMealDays: journal.filter((j) => j.last_meal_time != null && j.last_meal_time >= '21:00').length,
      avgSleepEfficiency: avg(recent('sleep_efficiency')),
      avgSleepPerformance: avg(recent('sleep_performance')),
      avgSteps: avg(recent('steps')),
      weakDay:
        report.weakDay && report.weakDay.skipRate != null
          ? { day: report.weakDay.day, rate: report.weakDay.skipRate }
          : null,
      busySkips: skipsOf(['Too Busy / Ran Out of Time', 'Work Commitments']),
      internalShare:
        report.totalSkips >= 3 ? report.categoryMix.internal / report.totalSkips : null,
      buddySkips: skipsOf(['Not Having a Gym Buddy']),
      overallSkipRate: sessionsTotal > 0 ? report.totalSkips / sessionsTotal : null,
    };
  }

  /** Whether there is enough recent data for a metric to be measured at all. */
  static metricAvailable(values: MetricValues, id: MetricId): boolean {
    const since = addDays(getTodayLocal(), -28);
    const n = [...values.get(id)!.keys()].filter((d) => d > since).length;
    return id === 'attendance' ? n >= 4 : n >= 7;
  }

  // --------------------------------------------------------------- library

  static async getLibrary(): Promise<{ suggested: LibraryEntry[]; all: LibraryEntry[] }> {
    const user = await UserService.getCurrentUser();
    if (!user) return { suggested: [], all: [] };
    const values = await this.loadMetricValues(user.id);
    const signals = await this.computeSignals(user.id, values);

    const all: LibraryEntry[] = EXPERIMENT_TEMPLATES.map((template) => {
      const available = this.metricAvailable(values, template.primary);
      let suggestion: Suggestion | null = null;
      try {
        suggestion = template.trigger(signals);
      } catch {}
      return {
        template,
        available,
        missing: available ? null : `Needs ${METRICS[template.primary].label.toLowerCase()} data`,
        suggestion: available ? suggestion : null,
      };
    });

    const suggested = all
      .filter((e) => e.suggestion)
      .sort((a, b) => (b.suggestion!.score ?? 0) - (a.suggestion!.score ?? 0))
      .slice(0, 3);

    return { suggested, all };
  }

  static async getAvailableMetrics(): Promise<Record<MetricId, boolean>> {
    const user = await UserService.getCurrentUser();
    const out = {} as Record<MetricId, boolean>;
    const values = user ? await this.loadMetricValues(user.id) : null;
    for (const id of Object.keys(METRICS) as MetricId[]) {
      out[id] = values ? this.metricAvailable(values, id) : false;
    }
    return out;
  }

  // ------------------------------------------------------------- lifecycle

  static phaseOn(exp: Pick<Experiment, 'start_date' | 'schedule'>, date: string) {
    const start = new Date(exp.start_date + 'T00:00:00').getTime();
    const day = Math.round((new Date(date + 'T00:00:00').getTime() - start) / 86400000);
    if (day < 0 || day >= EXPERIMENT_DAYS) return null;
    const block = Math.floor(day / BLOCK_DAYS);
    return { day, block, phase: exp.schedule[block], dayInBlock: day % BLOCK_DAYS };
  }

  static async getActive(): Promise<Experiment | null> {
    await this.completeIfDue();
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return null;
    const row = await db.getFirstAsync<ExperimentRow>(
      `SELECT * FROM experiments WHERE user_id = ? AND status = 'active' ORDER BY id DESC LIMIT 1`,
      [user.id]
    );
    return row ? parse(row) : null;
  }

  static async get(id: number): Promise<Experiment | null> {
    await this.completeIfDue();
    const db = await database.getDatabase();
    const row = await db.getFirstAsync<ExperimentRow>('SELECT * FROM experiments WHERE id = ?', [id]);
    return row ? parse(row) : null;
  }

  static async getHistory(): Promise<Experiment[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];
    const rows = await db.getAllAsync<ExperimentRow>(
      `SELECT * FROM experiments WHERE user_id = ? AND status != 'active' ORDER BY id DESC`,
      [user.id]
    );
    return rows.map(parse);
  }

  static async start(input: NewExperimentInput): Promise<Experiment> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');
    if (await this.getActive()) {
      throw new Error('You already have an experiment running. One at a time keeps results clean.');
    }

    // Randomise which phase comes first, so "I was improving anyway" can't
    // masquerade as an effect.
    const schedule: Phase[] = Math.random() < 0.5 ? ['A', 'B', 'A', 'B'] : ['B', 'A', 'B', 'A'];
    // Starts tomorrow so every block is made of full days.
    const startDate = addDays(getTodayLocal(), 1);

    const res = await db.runAsync(
      `INSERT INTO experiments
         (user_id, template_id, title, rule, off_rule, hypothesis, primary_metric,
          secondary_metrics, schedule, start_date, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')`,
      [
        user.id,
        input.templateId,
        input.title,
        input.rule,
        input.offRule,
        input.hypothesis,
        input.primary,
        JSON.stringify(input.secondary.filter((m) => m !== input.primary)),
        JSON.stringify(schedule),
        startDate,
      ]
    );
    const exp = await this.get(res.lastInsertRowId);
    if (!exp) throw new Error('Failed to start experiment');
    await NotificationService.requestPermissions().catch(() => false);
    await this.scheduleReminders(exp).catch(() => {});
    return exp;
  }

  static async getCheckins(experimentId: number): Promise<Map<string, boolean>> {
    const db = await database.getDatabase();
    const rows = await db.getAllAsync<ExperimentCheckin>(
      'SELECT * FROM experiment_checkins WHERE experiment_id = ?',
      [experimentId]
    );
    return new Map(rows.map((r) => [r.local_date, r.complied === 1]));
  }

  static async checkIn(exp: Experiment, date: string, complied: boolean): Promise<void> {
    if (!this.phaseOn(exp, date)) throw new Error('That day is outside the experiment.');
    if (date > getTodayLocal()) throw new Error("You can't check in for the future.");
    const db = await database.getDatabase();
    await db.runAsync(
      `INSERT INTO experiment_checkins (experiment_id, local_date, complied) VALUES (?, ?, ?)
       ON CONFLICT(experiment_id, local_date) DO UPDATE SET complied = excluded.complied`,
      [exp.id, date, complied ? 1 : 0]
    );
    await this.scheduleReminders(exp).catch(() => {});
  }

  /** Quitting is allowed, but it is recorded — and the Lab Rat notices. */
  static async abandon(exp: Experiment): Promise<void> {
    const db = await database.getDatabase();
    await db.runAsync(
      `UPDATE experiments SET status = 'abandoned', ended_at = ? WHERE id = ?`,
      [new Date().toISOString(), exp.id]
    );
    await NotificationService.cancelExperimentCheckins().catch(() => {});
  }

  /**
   * Finish experiments whose last block has ended. Waits one extra day so the
   * final night's sleep (stored against the next morning) has synced.
   */
  static async completeIfDue(): Promise<Experiment[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];
    const today = getTodayLocal();
    const due = (
      await db.getAllAsync<ExperimentRow>(
        `SELECT * FROM experiments WHERE user_id = ? AND status = 'active'`,
        [user.id]
      )
    )
      .map(parse)
      .filter((e) => today > addDays(e.endDate, 1));
    if (due.length === 0) return [];

    const values = await this.loadMetricValues(user.id);
    const lab = await LabService.loadData();
    const done: Experiment[] = [];
    for (const exp of due) {
      const checkins = await this.getCheckins(exp.id);
      const result = this.analyze(exp, values, checkins, lab);
      await db.runAsync(
        `UPDATE experiments SET status = 'completed', result = ?, ended_at = ? WHERE id = ?`,
        [JSON.stringify(result), new Date().toISOString(), exp.id]
      );
      done.push({ ...exp, status: 'completed', result });
    }
    await NotificationService.cancelExperimentCheckins().catch(() => {});
    return done;
  }

  /** Re-arm the next week of 9pm check-in reminders, skipping days already logged. */
  static async scheduleReminders(exp: Experiment): Promise<void> {
    await NotificationService.cancelExperimentCheckins();
    if (exp.status !== 'active') return;
    const checkins = await this.getCheckins(exp.id);
    const today = getTodayLocal();
    const dates: { date: string; phase: Phase }[] = [];
    for (let i = 0; i < NOTIFICATION_DAYS_AHEAD; i++) {
      const date = addDays(today, i);
      const p = this.phaseOn(exp, date);
      if (p && !checkins.has(date)) dates.push({ date, phase: p.phase });
    }
    await NotificationService.scheduleExperimentCheckins(
      dates.map(({ date, phase }) => ({
        date,
        hour: CHECKIN_HOUR,
        title: `🧪 ${exp.title}`,
        body:
          phase === 'B'
            ? `Rule ON today. Did you stick to it? Check in before the day ends.`
            : `Rule OFF week. Did you live normally? Check in before the day ends.`,
      }))
    );
  }

  // -------------------------------------------------------------- analysis

  static analyze(
    exp: Experiment,
    values: MetricValues,
    checkins: Map<string, boolean>,
    lab: Awaited<ReturnType<typeof LabService.loadData>>
  ): ExperimentResult {
    const complied = [...checkins.values()].filter(Boolean).length;
    const compliance = complied / EXPERIMENT_DAYS;

    const primary = this.analyzeMetric(exp, exp.primary_metric, values, checkins);
    // Pre-registered rule: with poor compliance the primary result can't be
    // trusted, whatever the numbers say.
    if (compliance < MIN_COMPLIANCE && primary.verdict !== 'inconclusive') {
      primary.verdict = 'inconclusive';
      primary.reason = `You stuck to the plan on only ${Math.round(compliance * 100)}% of days. That's too few to trust the result.`;
    }
    const secondary = exp.secondary_metrics.map((m) => this.analyzeMetric(exp, m, values, checkins));

    // Things that could have muddied the comparison, by phase.
    const flags: string[] = [];
    const count = (pred: (date: string) => boolean) => {
      const out = { A: 0, B: 0 };
      for (let i = 0; i < EXPERIMENT_DAYS; i++) {
        const date = addDays(exp.start_date, i);
        if (pred(date)) out[exp.schedule[Math.floor(i / BLOCK_DAYS)]]++;
      }
      return out;
    };
    const describe = (label: string, c: { A: number; B: number }) => {
      if (c.A + c.B > 0) flags.push(`${label}: ${c.B} in rule-on weeks, ${c.A} in rule-off weeks`);
    };
    const skipOn = new Map(lab.skips.map((s) => [s.skip_date, s.excuse]));
    describe(
      'Sick days',
      count((d) => getExcuse(skipOn.get(d) ?? '').check === 'illness')
    );
    describe('Travel days', count((d) => skipOn.get(d) === 'Travelling'));
    const rhrMean = lab.baseline?.ready ? lab.baseline.rhrMean : null;
    if (rhrMean) {
      describe(
        'Days with resting HR 5+ bpm above normal',
        count((d) => (lab.metrics.get(d)?.resting_hr ?? 0) >= rhrMean + 5)
      );
    }

    return { compliance, primary, secondary, flags, computedAt: new Date().toISOString() };
  }

  static analyzeMetric(
    exp: Pick<Experiment, 'start_date' | 'schedule'>,
    metric: MetricId,
    values: MetricValues,
    checkins: Map<string, boolean>
  ): MetricResult {
    const def = METRICS[metric];
    const series = values.get(metric) ?? new Map<string, number>();
    const blocks: number[][] = Array.from({ length: BLOCK_COUNT }, () => []);

    for (let b = 0; b < BLOCK_COUNT; b++) {
      for (let i = def.washout; i < BLOCK_DAYS; i++) {
        const date = addDays(exp.start_date, b * BLOCK_DAYS + i);
        // Only days the plan was actually followed count — either way round.
        if (checkins.get(date) !== true) continue;
        const v = series.get(addDays(date, def.lag));
        if (v != null) blocks[b].push(v);
      }
    }

    const on = blocks.filter((_, b) => exp.schedule[b] === 'B').flat();
    const off = blocks.filter((_, b) => exp.schedule[b] === 'A').flat();
    const blockMeans = blocks.map((v) => (v.length ? mean(v) : null));
    const base = {
      metric,
      nOn: on.length,
      nOff: off.length,
      blockMeans,
    };

    if (on.length < def.minPerPhase || off.length < def.minPerPhase) {
      return {
        ...base,
        verdict: 'inconclusive',
        onMean: on.length ? mean(on) : null,
        offMean: off.length ? mean(off) : null,
        diff: null,
        threshold: null,
        t: null,
        consistent: false,
        reason: `Not enough usable days (${on.length} rule-on, ${off.length} rule-off; needs ${def.minPerPhase} each).`,
      };
    }

    const mOn = mean(on);
    const mOff = mean(off);
    const diff = mOn - mOff;
    const sign = def.better === 'higher' ? 1 : -1;
    const gain = diff * sign;

    // Within-person noise: pooled SD after removing each phase's mean. Half of
    // it is the smallest change worth caring about. Show-up rate is binary per
    // session, so it uses a fixed 15-point threshold instead.
    const pooledSd = Math.sqrt(
      ((on.length - 1) * variance(on, mOn) + (off.length - 1) * variance(off, mOff)) /
        Math.max(1, on.length + off.length - 2)
    );
    const threshold = metric === 'attendance' ? 15 : 0.5 * pooledSd;
    const se = Math.sqrt(variance(on, mOn) / on.length + variance(off, mOff) / off.length);
    const t = se > 0 ? diff / se : diff === 0 ? 0 : Infinity * Math.sign(diff);

    const onBlocks = blockMeans.filter((_, b) => exp.schedule[b] === 'B');
    const offBlocks = blockMeans.filter((_, b) => exp.schedule[b] === 'A');
    const consistent =
      onBlocks.every((v) => v != null) &&
      offBlocks.every((v) => v != null) &&
      (gain >= 0
        ? Math.min(...onBlocks.map((v) => v! * sign)) > Math.max(...offBlocks.map((v) => v! * sign))
        : Math.max(...onBlocks.map((v) => v! * sign)) < Math.min(...offBlocks.map((v) => v! * sign)));

    let verdict: MetricVerdict;
    let reason: string;
    if (Math.abs(gain) < threshold) {
      verdict = 'no_effect';
      reason = 'The difference is smaller than your normal day-to-day variation.';
    } else if (Math.abs(t) >= 2 && consistent) {
      verdict = gain > 0 ? 'worked' : 'worse';
      reason =
        gain > 0
          ? 'A clear difference, and both rule-on weeks beat both rule-off weeks.'
          : 'A clear difference in the wrong direction, repeated in both rule-on weeks.';
    } else {
      verdict = 'inconclusive';
      reason = consistent
        ? 'A difference showed up, but the days were too noisy to be sure.'
        : "A difference showed up, but it didn't repeat across both rule-on weeks.";
    }

    return { ...base, verdict, onMean: mOn, offMean: mOff, diff, threshold, t: isFinite(t) ? t : null, consistent, reason };
  }

  /** Counts for trophies. */
  static async getCounts(userId: number): Promise<{ completed: number; abandoned: number; worked: number }> {
    try {
      const db = await database.getDatabase();
      const rows = await db.getAllAsync<ExperimentRow>(
        `SELECT * FROM experiments WHERE user_id = ? AND status != 'active'`,
        [userId]
      );
      const parsed = rows.map(parse);
      return {
        completed: parsed.filter((e) => e.status === 'completed').length,
        abandoned: parsed.filter((e) => e.status === 'abandoned').length,
        worked: parsed.filter((e) => e.result?.primary.verdict === 'worked').length,
      };
    } catch {
      return { completed: 0, abandoned: 0, worked: 0 };
    }
  }
}
