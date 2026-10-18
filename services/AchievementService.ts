import { database, AchievementUnlock } from '@/database/database';
import { UserService } from './UserService';
import { WorkoutService } from './WorkoutService';
import { FreezeTokenService } from './FreezeTokenService';
import { RedemptionWorkoutService } from './RedemptionWorkoutService';
import { JourneyService } from './JourneyService';
import { HealthProfileService } from './HealthProfileService';
import { LabService, addDays, weekdayOf, type LabData } from './LabService';
import { ExperimentService } from './ExperimentService';
import {
  ACHIEVEMENTS,
  type AchievementDefinition,
  type AchievementStats,
} from '@/constants/achievements';
import { getTodayLocal, parseLocalDateString } from '@/utils/dateUtils';

export interface AchievementState {
  def: AchievementDefinition;
  unlockedAt: string | null;
  seen: boolean;
  /** Current value toward the target, capped at the target. */
  value: number;
}

const DEFAULT_STEPS_GOAL = 8000;

/** Longest run of consecutive calendar days in a set of YYYY-MM-DD dates. */
const longestDayRun = (dates: string[]): number => {
  const set = new Set(dates);
  let best = 0;
  for (const d of set) {
    if (set.has(addDays(d, -1))) continue; // not the start of a run
    let len = 1;
    while (set.has(addDays(d, len))) len++;
    best = Math.max(best, len);
  }
  return best;
};

/** Most dates that fall inside any window of `days` days. Dates sorted ascending. */
const maxInWindow = (sorted: string[], days: number): number => {
  let best = 0;
  let start = 0;
  for (let end = 0; end < sorted.length; end++) {
    while (sorted[start] <= addDays(sorted[end], -days)) start++;
    best = Math.max(best, end - start + 1);
  }
  return best;
};

/** Monday of the week containing `date`, as YYYY-MM-DD. */
const weekStart = (date: string): string => addDays(date, -((weekdayOf(date) + 6) % 7));

type UnlockListener = (unlocked: AchievementDefinition[]) => void;

export class AchievementService {
  private static evaluateInFlight: Promise<AchievementDefinition[]> | null = null;
  private static listeners = new Set<UnlockListener>();

  /** The celebration overlay subscribes here; every new unlock is announced once. */
  static onUnlock(listener: UnlockListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  static async computeStats(data?: LabData): Promise<AchievementStats> {
    const lab = data ?? (await LabService.loadData());
    const report = LabService.buildReport(lab);
    const { skips, workouts, metrics } = lab;
    const today = getTodayLocal();

    const user = await UserService.getCurrentUser().catch(() => null);
    const experiments = user
      ? await ExperimentService.getCounts(user.id)
      : { completed: 0, abandoned: 0, worked: 0 };

    const [currentStreak, highestStreak, tokens, redemptions, journeys, profile] =
      await Promise.all([
        WorkoutService.getCurrentStreak().catch(() => 0),
        UserService.getHighestStreak().catch(() => 0),
        FreezeTokenService.getTokenStats().catch(() => null),
        RedemptionWorkoutService.getRedemptionStats().catch(() => null),
        JourneyService.getCompletionHistory().catch(() => []),
        HealthProfileService.getProfile().catch(() => null),
      ]);

    const workoutDates = workouts.map((w) => w.workout_date);
    const skipDates = skips.map((s) => s.skip_date).sort();
    const skipDateSet = new Set(skipDates);

    // Perfect week: 4+ workouts Monday-Sunday and no excuse that week.
    const perWeek = new Map<string, number>();
    for (const d of workoutDates) perWeek.set(weekStart(d), (perWeek.get(weekStart(d)) ?? 0) + 1);
    const skipWeeks = new Set(skipDates.map(weekStart));
    const perfectWeeks = [...perWeek.entries()].filter(
      ([week, count]) => count >= 4 && !skipWeeks.has(week)
    ).length;

    const hours = workouts
      .filter((w) => w.started_at)
      .map((w) => new Date(w.started_at as string).getHours());

    // Clean days only count once the window also has real training in it —
    // otherwise a new or abandoned account would earn "Clean Month" for nothing.
    const lastSkip = skipDates[skipDates.length - 1];
    const createdDate = user?.created_at ? user.created_at.slice(0, 10) : today;
    const cleanSince = lastSkip ?? createdDate;
    const cleanSpan = Math.floor(
      (parseLocalDateString(today).getTime() - parseLocalDateString(cleanSince).getTime()) / 86400000
    );
    const workoutsInClean = workoutDates.filter((d) => d > cleanSince).length;
    const cleanDays = workoutsInClean >= 8 ? cleanSpan : Math.min(cleanSpan, 29);

    const comebacks = skips.filter((s) => workoutDates.includes(addDays(s.skip_date, 1))).length;

    // Weak spot: the weekday with the most skips (at least 2). Count workouts on
    // that weekday since the last time it was skipped.
    const weakDay = [...report.weekdays].filter((w) => w.skips >= 2).sort((a, b) => b.skips - a.skips)[0];
    let weakDayWins = 0;
    if (weakDay) {
      const lastWeakSkip = skipDates.filter((d) => weekdayOf(d) === weakDay.day).pop() ?? '';
      weakDayWins = workoutDates.filter((d) => weekdayOf(d) === weakDay.day && d > lastWeakSkip).length;
    }

    const tiredButWent = workoutDates.filter((d) => {
      const m = metrics.get(d);
      return (
        (m?.recovery_score != null && m.recovery_score < 34) ||
        (m?.sleep_duration_min != null && m.sleep_duration_min < 360)
      );
    }).length;

    const sleepGoal = profile?.sleepGoalMin ?? 480;
    const stepsGoal = profile?.stepsGoal ?? DEFAULT_STEPS_GOAL;
    const sleepDays: string[] = [];
    const stepDays: string[] = [];
    const greenDays: string[] = [];
    for (const [date, m] of metrics) {
      if (m.sleep_duration_min != null && m.sleep_duration_min >= sleepGoal) sleepDays.push(date);
      if (m.steps != null && m.steps >= stepsGoal) stepDays.push(date);
      if (m.recovery_score != null && m.recovery_score >= 67) greenDays.push(date);
    }

    const excuseCounts: Record<string, number> = {};
    for (const s of skips) excuseCounts[s.excuse] = (excuseCounts[s.excuse] ?? 0) + 1;

    const emergencyDates = skips
      .filter((s) => s.excuse === 'Genuine Emergency')
      .map((s) => s.skip_date)
      .sort();

    // Same excuse in a row, in the order the skips happened.
    const ordered = [...skips].sort((a, b) => a.skip_date.localeCompare(b.skip_date));
    let longestSameExcuseRun = 0;
    let run = 0;
    for (let i = 0; i < ordered.length; i++) {
      run = i > 0 && ordered[i].excuse === ordered[i - 1].excuse ? run + 1 : 1;
      longestSameExcuseRun = Math.max(longestSameExcuseRun, run);
    }

    return {
      totalWorkouts: workouts.length,
      bestStreak: Math.max(currentStreak, highestStreak),
      perfectWeeks,
      earlyWorkouts: hours.filter((h) => h < 8).length,
      lateWorkouts: hours.filter((h) => h >= 20).length,
      longestSessionMin: Math.floor(Math.max(0, ...workouts.map((w) => w.duration ?? 0)) / 60),
      cleanDays: skipDateSet.has(today) ? 0 : cleanDays,
      comebacks,
      redemptionsCompleted: redemptions?.completedRedemptions ?? 0,
      freezeTokensEarned: tokens?.totalEarned ?? 0,
      weakDayWins,
      tiredButWent,
      backedExcuses: report.honesty.backed,
      disputedExcuses: report.honesty.disputed,
      sleepGoalRun: longestDayRun(sleepDays),
      stepsGoalRun: longestDayRun(stepDays),
      greenRun: longestDayRun(greenDays),
      journeysCompleted: journeys.length,
      distinctExcuses: Object.keys(excuseCounts).length,
      excuseCounts,
      maxSkipsIn7Days: maxInWindow(skipDates, 7),
      maxEmergenciesIn30Days: maxInWindow(emergencyDates, 30),
      longestSameExcuseRun,
      experimentsCompleted: experiments.completed,
      experimentsAbandoned: experiments.abandoned,
      experimentsWorked: experiments.worked,
    };
  }

  /**
   * Unlock anything newly earned and return it. Earned trophies are never
   * revoked, even if the underlying number later drops (e.g. a streak breaks).
   */
  static async evaluate(): Promise<AchievementDefinition[]> {
    if (this.evaluateInFlight) return this.evaluateInFlight;
    this.evaluateInFlight = (async () => {
      try {
        const db = await database.getDatabase();
        const user = await UserService.getCurrentUser();
        if (!user) return [];

        const stats = await this.computeStats();
        const unlocked = new Set(
          (
            await db.getAllAsync<{ achievement_id: string }>(
              'SELECT achievement_id FROM achievements WHERE user_id = ?',
              [user.id]
            )
          ).map((r) => r.achievement_id)
        );

        const fresh = ACHIEVEMENTS.filter(
          (a) => !unlocked.has(a.id) && a.value(stats) >= a.target
        );
        const now = new Date().toISOString();
        for (const a of fresh) {
          await db.runAsync(
            'INSERT OR IGNORE INTO achievements (user_id, achievement_id, unlocked_at, seen) VALUES (?, ?, ?, 0)',
            [user.id, a.id, now]
          );
        }
        if (fresh.length > 0) this.listeners.forEach((l) => l(fresh));
        return fresh;
      } catch (error) {
        console.error('Error evaluating achievements:', error);
        return [];
      } finally {
        this.evaluateInFlight = null;
      }
    })();
    return this.evaluateInFlight;
  }

  static async getAll(): Promise<AchievementState[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];

    const [rows, stats] = await Promise.all([
      db.getAllAsync<AchievementUnlock>('SELECT * FROM achievements WHERE user_id = ?', [user.id]),
      this.computeStats(),
    ]);
    const byId = new Map(rows.map((r) => [r.achievement_id, r]));

    return ACHIEVEMENTS.map((def) => {
      const row = byId.get(def.id);
      return {
        def,
        unlockedAt: row?.unlocked_at ?? null,
        seen: row ? row.seen === 1 : true,
        value: row ? def.target : Math.min(def.value(stats), def.target),
      };
    });
  }

  static async getSummary(): Promise<{
    unlocked: number;
    total: number;
    unseen: number;
    recent: AchievementDefinition[];
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return { unlocked: 0, total: ACHIEVEMENTS.length, unseen: 0, recent: [] };

    const rows = await db.getAllAsync<AchievementUnlock>(
      'SELECT * FROM achievements WHERE user_id = ? ORDER BY unlocked_at DESC',
      [user.id]
    );
    const defs = new Map(ACHIEVEMENTS.map((a) => [a.id, a]));
    return {
      unlocked: rows.filter((r) => defs.has(r.achievement_id)).length,
      total: ACHIEVEMENTS.length,
      unseen: rows.filter((r) => r.seen === 0).length,
      recent: rows
        .map((r) => defs.get(r.achievement_id))
        .filter((a): a is AchievementDefinition => a != null)
        .slice(0, 5),
    };
  }

  static async markAllSeen(): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return;
    await db.runAsync('UPDATE achievements SET seen = 1 WHERE user_id = ? AND seen = 0', [user.id]);
  }
}
