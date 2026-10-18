import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@/database/database';
import { UserService } from './UserService';
import { AchievementService } from './AchievementService';
import { addDays, weekdayOf } from './LabService';
import { getTodayLocal, parseLocalDateString } from '@/utils/dateUtils';
import { EXPERIMENT_DAYS } from '@/constants/experiments';

/**
 * Fake history for testing the Lab, trophies and Health screens on a real phone.
 *
 * Every inserted row id is recorded so `remove()` deletes exactly what was
 * generated and nothing else. Inserts use OR IGNORE, so a day that already has
 * real data (a real workout, a synced health day) is left untouched rather
 * than overwritten.
 */

const STORAGE_KEY = '@test_data_ids_v1';
const DAYS = 60;

type TrackedTable =
  | 'experiment_checkins'
  | 'experiments'
  | 'workouts'
  | 'skips'
  | 'health_daily_metrics'
  | 'daily_journal'
  | 'health_baselines';

type Tracked = Record<TrackedTable, number[]>;

// Deletion runs in key order, so check-ins go before the experiment they belong to.
const emptyTracked = (): Tracked => ({
  experiment_checkins: [],
  experiments: [],
  workouts: [],
  skips: [],
  health_daily_metrics: [],
  daily_journal: [],
  health_baselines: [],
});

/** Small seeded PRNG so every generation produces the same believable history. */
const mulberry32 = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** Training days and planned times. Evening sessions are skipped more often. */
const PLAN: Record<number, { time: string; skipChance: number }> = {
  1: { time: '18:30', skipChance: 0.6 }, // Monday — the designed weak spot
  2: { time: '18:30', skipChance: 0.3 },
  4: { time: '07:00', skipChance: 0.1 },
  6: { time: '09:00', skipChance: 0.2 },
};

// Weighted toward excuses the Lab can fact-check, so the demo has receipts.
const EXCUSE_POOL = [
  'Feeling Unmotivated / Tired',
  'Feeling Unmotivated / Tired',
  'Feeling Unmotivated / Tired',
  'Too Busy / Ran Out of Time',
  'Too Busy / Ran Out of Time',
  'Too Sore / Need Recovery',
  'Feeling Anxious',
  'Sick / Injured',
  'Work Commitments',
  'Bad Weather',
  'Bad Weather',
  'Not Having a Gym Buddy',
];

const sqliteUtc = (d: Date) => d.toISOString().replace('T', ' ').slice(0, 19);

const atLocal = (date: string, time: string) => {
  const d = parseLocalDateString(date);
  const [h, m] = time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d;
};

export class TestDataService {
  static async hasTestData(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(STORAGE_KEY)) != null;
    } catch {
      return false;
    }
  }

  static async generate(): Promise<{ workouts: number; skips: number; healthDays: number; experiments: number }> {
    if (await this.hasTestData()) {
      throw new Error('Test data already exists. Remove it first.');
    }
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const rand = mulberry32(42);
    const between = (min: number, max: number) => min + rand() * (max - min);
    const today = getTodayLocal();
    const tracked = emptyTracked();

    await database.runInTransaction(async (db) => {
      const insert = async (table: TrackedTable, sql: string, params: (string | number | null)[]) => {
        const res = await db.runAsync(sql, params);
        if (res.changes > 0) tracked[table].push(res.lastInsertRowId);
        return res.changes > 0;
      };

      const workoutDates = new Set<string>();

      // workouts and skips have no unique constraint, so days that already hold
      // a real session are skipped explicitly instead of relying on OR IGNORE.
      const realDays = new Set(
        (
          await db.getAllAsync<{ d: string }>(
            `SELECT workout_date AS d FROM workouts WHERE user_id = ?
             UNION SELECT skip_date AS d FROM skips WHERE user_id = ?`,
            [user.id, user.id]
          )
        ).map((r) => r.d)
      );

      // A finished "10,000 steps" experiment, so the results screen can be seen
      // without waiting 4 weeks. Rule-on days get more steps and, the next
      // night, about 40 extra minutes of sleep — a real effect to detect.
      const expStart = addDays(today, -(EXPERIMENT_DAYS + 7));
      const expSchedule: ('A' | 'B')[] = ['B', 'A', 'B', 'A'];
      const sleepBonus = new Map<string, number>();
      // Never alongside a real running experiment — there may only be one active.
      const hasActive = await db.getFirstAsync<{ id: number }>(
        `SELECT id FROM experiments WHERE user_id = ? AND status = 'active' LIMIT 1`,
        [user.id]
      );
      const expAdded = !hasActive && await insert(
        'experiments',
        `INSERT INTO experiments
           (user_id, template_id, title, rule, off_rule, hypothesis, primary_metric,
            secondary_metrics, schedule, start_date, status)
         VALUES (?, 'ten_k_steps', '10,000 steps a day', ?, ?, ?, 'sleep_duration', ?, ?, ?, 'active')`,
        [
          user.id,
          'Hit 10,000 steps every day.',
          'Move as much as you normally would.',
          'More daily movement lengthens sleep.',
          JSON.stringify(['resting_hr', 'stress']),
          JSON.stringify(expSchedule),
          expStart,
        ]
      );
      const experimentId = expAdded ? tracked.experiments[tracked.experiments.length - 1] : null;

      for (let offset = DAYS; offset >= 1; offset--) {
        const date = addDays(today, -offset);
        const day = weekdayOf(date);

        const expDay = Math.round(
          (parseLocalDateString(date).getTime() - parseLocalDateString(expStart).getTime()) / 86400000
        );
        const inExperiment = experimentId != null && expDay >= 0 && expDay <= EXPERIMENT_DAYS;

        // A normal day's body data, nudged below for skip days. Sleep noise is
        // narrower during the demo experiment so its built-in effect reliably
        // clears the noise threshold.
        let sleep =
          Math.round(inExperiment ? between(420, 470) : between(390, 500)) + (sleepBonus.get(date) ?? 0);
        let steps = Math.round(between(5000, 11000));

        if (inExperiment && expDay < EXPERIMENT_DAYS) {
          const ruleOn = expSchedule[Math.floor(expDay / 7)] === 'B';
          if (ruleOn) {
            steps = Math.round(between(10500, 14000));
            sleepBonus.set(addDays(date, 1), 40);
          }
          // Followed the plan on ~90% of days.
          await insert(
            'experiment_checkins',
            'INSERT OR IGNORE INTO experiment_checkins (experiment_id, local_date, complied) VALUES (?, ?, ?)',
            [experimentId, date, rand() < 0.9 ? 1 : 0]
          );
        }
        let rhr = Math.round(between(53, 58));
        let hrv = Math.round(between(48, 66));
        let stress: number | null = rand() < 0.4 ? Math.round(between(1, 3)) : null;

        const plan = PLAN[day];
        if (plan && !realDays.has(date)) {
          if (rand() < plan.skipChance) {
            const excuse = EXCUSE_POOL[Math.floor(rand() * EXCUSE_POOL.length)];
            const honest = rand() < 0.55;

            // Shape the day so fact-checks land on a mix of verdicts.
            if (excuse === 'Feeling Unmotivated / Tired' && !inExperiment) sleep = honest ? Math.round(between(290, 345)) : Math.round(between(460, 520));
            if (excuse === 'Too Busy / Ran Out of Time') steps = honest ? Math.round(between(11000, 15000)) : Math.round(between(900, 2600));
            if (excuse === 'Feeling Anxious') stress = honest ? 4 + Math.round(rand()) : 2;
            if (excuse === 'Sick / Injured' && honest) {
              rhr += 6;
              hrv = Math.round(hrv * 0.65);
            }

            // About one in five excuses is logged the next morning, after the fact.
            const loggedAt = rand() < 0.2 ? atLocal(addDays(date, 1), '09:15') : atLocal(date, '12:00');
            await insert(
              'skips',
              'INSERT INTO skips (user_id, excuse, skip_date, scheduled_time, created_at) VALUES (?, ?, ?, ?, ?)',
              [user.id, excuse, date, plan.time, sqliteUtc(loggedAt)]
            );
          } else {
            const start = atLocal(date, plan.time);
            start.setMinutes(start.getMinutes() + Math.round(between(-10, 20)));
            // The occasional long session, for the Long Haul trophy.
            const duration = Math.round(rand() < 0.08 ? between(5500, 6200) : between(2700, 4500));
            const end = new Date(start.getTime() + duration * 1000);
            const added = await insert(
              'workouts',
              `INSERT OR IGNORE INTO workouts
                 (user_id, verified, workout_date, duration, status, started_at, ended_at)
               VALUES (?, 1, ?, ?, 'completed', ?, ?)`,
              [user.id, date, duration, start.toISOString(), end.toISOString()]
            );
            if (added) workoutDates.add(date);
          }
        }

        // Recovery derived from the same inputs the real score leans on.
        const recovery = Math.max(
          5,
          Math.min(98, Math.round(55 + (sleep - 440) / 3 + (hrv - 57) * 1.2 - (rhr - 55) * 3))
        );
        const band = recovery >= 67 ? 'green' : recovery >= 34 ? 'yellow' : 'red';
        const distance = Math.round((steps * 0.00075) * 100) / 100;

        await insert(
          'health_daily_metrics',
          `INSERT OR IGNORE INTO health_daily_metrics
             (user_id, local_date, hrv_ms, resting_hr, sleep_duration_min, sleep_need_min,
              sleep_performance, recovery_score, recovery_band, steps, distance_km,
              active_calories, total_calories)
           VALUES (?, ?, ?, ?, ?, 480, ?, ?, ?, ?, ?, ?, ?)`,
          [
            user.id,
            date,
            hrv,
            rhr,
            sleep,
            Math.min(100, Math.round((sleep / 480) * 100)),
            recovery,
            band,
            steps,
            distance,
            Math.round(steps * 0.04 + (workoutDates.has(date) ? 350 : 0)),
            Math.round(2100 + steps * 0.04 + (workoutDates.has(date) ? 350 : 0)),
          ]
        );

        if (stress != null) {
          await insert(
            'daily_journal',
            'INSERT OR IGNORE INTO daily_journal (user_id, local_date, stress_level) VALUES (?, ?, ?)',
            [user.id, date, stress]
          );
        }
      }

      // Without a baseline the illness/anxiety checks can't run. Only added when
      // the user has none; a real sync recomputes it either way.
      await insert(
        'health_baselines',
        `INSERT OR IGNORE INTO health_baselines
           (user_id, hrv_mean, hrv_sd, rhr_mean, rhr_sd, sleep_duration_mean, sample_days)
         VALUES (?, ?, 0.15, 55.5, 1.6, 445, ?)`,
        [user.id, Math.log(57), DAYS]
      );
    }, 'test-data-generate');

    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(tracked));
    await AchievementService.evaluate();

    return {
      workouts: tracked.workouts.length,
      skips: tracked.skips.length,
      healthDays: tracked.health_daily_metrics.length,
      experiments: tracked.experiments.length,
    };
  }

  /**
   * Delete exactly the generated rows. Trophies are cleared and re-evaluated,
   * because ones earned from fake data would otherwise stay unlocked forever;
   * anything real data still earns comes straight back (with today's date).
   */
  static async remove(): Promise<void> {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const tracked: Tracked = { ...emptyTracked(), ...JSON.parse(raw) };
    const user = await UserService.getCurrentUser();

    await database.runInTransaction(async (db) => {
      for (const table of Object.keys(tracked) as TrackedTable[]) {
        const ids = tracked[table];
        // Chunked to stay well under SQLite's bound-parameter limit.
        for (let i = 0; i < ids.length; i += 200) {
          const chunk = ids.slice(i, i + 200);
          await db.runAsync(
            `DELETE FROM ${table} WHERE id IN (${chunk.map(() => '?').join(',')})`,
            chunk
          );
        }
      }
      if (user) await db.runAsync('DELETE FROM achievements WHERE user_id = ?', [user.id]);
    }, 'test-data-remove');

    await AsyncStorage.removeItem(STORAGE_KEY);
    await AchievementService.evaluate();
  }
}
