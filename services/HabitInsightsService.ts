import { database } from '@/database/database';
import { UserService } from './UserService';
import { addDays } from './LabService';

/**
 * Two Lab analyses built from data the user already logs:
 *
 * - Habits → body: how the morning after a habit (drinks, caffeine, a late
 *   dinner, a stressful day) differs from the morning after a day without it.
 * - Best time to train: show-up rate and session length by time of day.
 *
 * Same standard as experiments: a difference is only reported when it beats
 * half the user's own day-to-day spread, with enough days on each side.
 * Observational, not causal — the UI says so.
 */

export type HabitId = 'alcohol' | 'caffeine' | 'late_meal' | 'stress';
export type OutcomeId = 'hrv' | 'resting_hr' | 'sleep' | 'recovery';

export interface HabitFinding {
  habit: HabitId;
  outcome: OutcomeId;
  /** Mean the morning after a habit day, and after a non-habit day. */
  withHabit: number;
  without: number;
  /** Relative change, signed so positive is better for the user. */
  betterPct: number;
  nWith: number;
  nWithout: number;
  /** Plain-language line, e.g. "HRV is 14% lower the morning after 2+ drinks". */
  text: string;
}

export interface HabitReport {
  findings: HabitFinding[];
  /** Habits with too few logged days either way, so the UI can say what to log. */
  needsData: HabitId[];
}

export type Slot = 'morning' | 'afternoon' | 'evening';

export interface SlotStat {
  slot: Slot;
  sessions: number;
  shownUp: number;
  rate: number | null;
  avgMinutes: number | null;
}

export interface BestTimeReport {
  slots: SlotStat[];
  best: Slot | null;
  text: string | null;
}

const MIN_DAYS = 4;

const HABITS: Record<HabitId, { label: string; with: string }> = {
  alcohol: { label: 'Drinks', with: 'after 2+ drinks' },
  caffeine: { label: 'Caffeine', with: 'after 3+ coffees' },
  late_meal: { label: 'Late dinner', with: 'after eating past 9pm' },
  stress: { label: 'Stress', with: 'after a stressful day' },
};

const OUTCOMES: Record<OutcomeId, { label: string; better: 'higher' | 'lower' }> = {
  hrv: { label: 'HRV', better: 'higher' },
  resting_hr: { label: 'Resting HR', better: 'lower' },
  sleep: { label: 'Sleep', better: 'higher' },
  recovery: { label: 'Recovery', better: 'higher' },
};

export const HABIT_LABELS: Record<HabitId, string> = Object.fromEntries(
  Object.entries(HABITS).map(([k, v]) => [k, v.label])
) as Record<HabitId, string>;

const mean = (v: number[]) => v.reduce((s, x) => s + x, 0) / v.length;
const variance = (v: number[], m: number) =>
  v.length > 1 ? v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1) : 0;

interface JournalRow {
  local_date: string;
  alcohol_units: number | null;
  caffeine_servings: number | null;
  last_meal_time: string | null;
  stress_level: number | null;
}

interface MorningRow {
  local_date: string;
  hrv_ms: number | null;
  resting_hr: number | null;
  sleep_duration_min: number | null;
  recovery_score: number | null;
}

/** Which side of the comparison a journal day falls on; null = neither (ignored). */
const classify: Record<HabitId, (j: JournalRow) => boolean | null> = {
  alcohol: (j) => (j.alcohol_units == null ? null : j.alcohol_units >= 2 ? true : j.alcohol_units === 0 ? false : null),
  caffeine: (j) =>
    j.caffeine_servings == null ? null : j.caffeine_servings >= 3 ? true : j.caffeine_servings <= 1 ? false : null,
  late_meal: (j) =>
    !j.last_meal_time ? null : j.last_meal_time >= '21:00' ? true : j.last_meal_time < '20:00' ? false : null,
  stress: (j) => (j.stress_level == null ? null : j.stress_level >= 4 ? true : j.stress_level <= 2 ? false : null),
};

const pick: Record<OutcomeId, (m: MorningRow) => number | null> = {
  hrv: (m) => m.hrv_ms,
  resting_hr: (m) => m.resting_hr,
  sleep: (m) => m.sleep_duration_min,
  recovery: (m) => m.recovery_score,
};

/** Pure analysis, separated from loading so it can be tested. */
export function analyzeHabits(journal: JournalRow[], mornings: Map<string, MorningRow>): HabitReport {
  const findings: HabitFinding[] = [];
  const needsData: HabitId[] = [];

  for (const habit of Object.keys(HABITS) as HabitId[]) {
    const yes = journal.filter((j) => classify[habit](j) === true);
    const no = journal.filter((j) => classify[habit](j) === false);
    if (yes.length < MIN_DAYS || no.length < MIN_DAYS) {
      needsData.push(habit);
      continue;
    }
    for (const outcome of Object.keys(OUTCOMES) as OutcomeId[]) {
      // Sleep and morning heart data are stored against the morning they were
      // recorded, so a habit on day D shows up in D+1's row.
      const next = (rows: JournalRow[]) =>
        rows
          .map((j) => mornings.get(addDays(j.local_date, 1)))
          .map((m) => (m ? pick[outcome](m) : null))
          .filter((v): v is number => v != null);
      const a = next(yes);
      const b = next(no);
      if (a.length < MIN_DAYS || b.length < MIN_DAYS) continue;
      const ma = mean(a);
      const mb = mean(b);
      const pooledSd = Math.sqrt(
        ((a.length - 1) * variance(a, ma) + (b.length - 1) * variance(b, mb)) / Math.max(1, a.length + b.length - 2)
      );
      const diff = ma - mb;
      if (Math.abs(diff) < 0.5 * pooledSd || mb === 0) continue; // within normal noise
      const sign = OUTCOMES[outcome].better === 'higher' ? 1 : -1;
      const pct = (diff / Math.abs(mb)) * 100;
      const better = pct * sign;
      const o = OUTCOMES[outcome];
      const amount =
        outcome === 'sleep'
          ? `${Math.round(Math.abs(diff))} min ${diff < 0 ? 'less' : 'more'}`
          : `${Math.round(Math.abs(pct))}% ${diff < 0 ? 'lower' : 'higher'}`;
      findings.push({
        habit,
        outcome,
        withHabit: ma,
        without: mb,
        betterPct: better,
        nWith: a.length,
        nWithout: b.length,
        text: `${o.label} is ${amount} the morning ${HABITS[habit].with}.`,
      });
    }
  }

  findings.sort((x, y) => Math.abs(y.betterPct) - Math.abs(x.betterPct));
  return { findings, needsData };
}

const slotOf = (hour: number): Slot => (hour < 12 ? 'morning' : hour < 17 ? 'afternoon' : 'evening');

/** Pure analysis of show-up by time of day. */
export function analyzeBestTime(
  workouts: { started_at: string | null; duration: number | null }[],
  skips: { scheduled_time: string | null }[]
): BestTimeReport {
  const slots: Record<Slot, { sessions: number; shownUp: number; minutes: number[] }> = {
    morning: { sessions: 0, shownUp: 0, minutes: [] },
    afternoon: { sessions: 0, shownUp: 0, minutes: [] },
    evening: { sessions: 0, shownUp: 0, minutes: [] },
  };
  for (const w of workouts) {
    if (!w.started_at) continue;
    const s = slots[slotOf(new Date(w.started_at).getHours())];
    s.sessions++;
    s.shownUp++;
    if (w.duration) s.minutes.push(w.duration / 60);
  }
  for (const k of skips) {
    if (!k.scheduled_time) continue;
    slots[slotOf(parseInt(k.scheduled_time.split(':')[0], 10))].sessions++;
  }

  const stats: SlotStat[] = (Object.keys(slots) as Slot[]).map((slot) => {
    const s = slots[slot];
    return {
      slot,
      sessions: s.sessions,
      shownUp: s.shownUp,
      rate: s.sessions > 0 ? s.shownUp / s.sessions : null,
      avgMinutes: s.minutes.length ? mean(s.minutes) : null,
    };
  });

  const eligible = stats.filter((s) => s.sessions >= 3 && s.rate != null);
  if (eligible.length < 2) return { slots: stats, best: null, text: null };
  const ranked = [...eligible].sort((a, b) => b.rate! - a.rate!);
  const [top, worst] = [ranked[0], ranked[ranked.length - 1]];
  // Only call a winner when it clearly beats the weakest slot.
  if (top.rate! - worst.rate! < 0.15) {
    return { slots: stats, best: null, text: 'You show up about equally at every time of day.' };
  }
  return {
    slots: stats,
    best: top.slot,
    text: `You show up ${Math.round(top.rate! * 100)}% of the time in the ${top.slot}, vs ${Math.round(
      worst.rate! * 100
    )}% in the ${worst.slot}.`,
  };
}

export class HabitInsightsService {
  static async load(): Promise<{ habits: HabitReport; bestTime: BestTimeReport }> {
    const empty = {
      habits: { findings: [], needsData: Object.keys(HABITS) as HabitId[] },
      bestTime: analyzeBestTime([], []),
    };
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return empty;

    let journal: JournalRow[] = [];
    let morningRows: MorningRow[] = [];
    try {
      journal = await db.getAllAsync<JournalRow>(
        `SELECT local_date, alcohol_units, caffeine_servings, last_meal_time, stress_level
         FROM daily_journal WHERE user_id = ?`,
        [user.id]
      );
      morningRows = await db.getAllAsync<MorningRow>(
        `SELECT local_date, hrv_ms, resting_hr, sleep_duration_min, recovery_score
         FROM health_daily_metrics WHERE user_id = ?`,
        [user.id]
      );
    } catch {}

    const workouts = await db
      .getAllAsync<{ started_at: string | null; duration: number | null }>(
        `SELECT started_at, duration FROM workouts WHERE user_id = ? AND verified = 1 AND status = 'completed'`,
        [user.id]
      )
      .catch(() => []);
    const skips = await db
      .getAllAsync<{ scheduled_time: string | null }>('SELECT scheduled_time FROM skips WHERE user_id = ?', [user.id])
      .catch(() => []);

    return {
      habits: analyzeHabits(journal, new Map(morningRows.map((m) => [m.local_date, m]))),
      bestTime: analyzeBestTime(workouts, skips),
    };
  }
}
