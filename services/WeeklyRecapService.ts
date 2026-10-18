import AsyncStorage from '@react-native-async-storage/async-storage';
import { database } from '@/database/database';
import { UserService } from './UserService';
import { WorkoutService } from './WorkoutService';
import { LabService, addDays, weekdayOf } from './LabService';
import { ACHIEVEMENTS, type AchievementDefinition } from '@/constants/achievements';
import { getTodayLocal } from '@/utils/dateUtils';

/**
 * The Sunday recap: one week (Monday–Sunday) summed up, compared with the week
 * before. Everything is derived from stored data on demand; nothing new is
 * tracked.
 */

export type RecapMood = 'perfect' | 'solid' | 'mixed' | 'rough' | 'ghost';

export interface WeeklyRecap {
  weekStart: string;
  weekEnd: string;
  mood: RecapMood;
  headline: string;
  workouts: number;
  /** How many of `workouts` were sport sessions. */
  sport: number;
  skips: number;
  minutes: number;
  /** Workouts / (workouts + skips), 0-100; null with no sessions. */
  showUpRate: number | null;
  streak: number;
  topExcuse: string | null;
  disputedExcuses: number;
  trophies: AchievementDefinition[];
  sleep: { avg: number | null; prev: number | null };
  steps: { avg: number | null; prev: number | null };
  recovery: { avg: number | null; prev: number | null };
  /** Weekday (0=Sun) of the longest workout, for a "best day" callout. */
  bestDay: { day: number; minutes: number } | null;
}

const SEEN_KEY = '@recap_seen_';

const mean = (v: number[]) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : null);

/**
 * The week a recap covers. On Sunday it is the week ending today, so the
 * evening notification shows the week that's just finishing; any other day it
 * is the most recent completed week.
 */
export const recapWeek = (today = getTodayLocal()) => {
  const dow = weekdayOf(today);
  const weekEnd = dow === 0 ? today : addDays(today, -dow);
  return { weekStart: addDays(weekEnd, -6), weekEnd };
};

export class WeeklyRecapService {
  static async build(weekStart?: string): Promise<WeeklyRecap | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return null;

    const week = weekStart ? { weekStart, weekEnd: addDays(weekStart, 6) } : recapWeek();
    const prevStart = addDays(week.weekStart, -7);
    const prevEnd = addDays(week.weekStart, -1);
    const inWeek = (d: string) => d >= week.weekStart && d <= week.weekEnd;
    const inPrev = (d: string) => d >= prevStart && d <= prevEnd;

    const lab = await LabService.loadData();
    const report = LabService.buildReport(lab);

    const workouts = lab.workouts.filter((w) => inWeek(w.workout_date));
    const skips = lab.skips.filter((s) => inWeek(s.skip_date));
    const total = workouts.length + skips.length;

    const counts = new Map<string, number>();
    for (const s of skips) counts.set(s.excuse, (counts.get(s.excuse) ?? 0) + 1);
    const topExcuse = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
    const disputedExcuses = report.factChecks.filter(
      (f) => f.verdict === 'disputed' && inWeek(f.skip.skip_date)
    ).length;

    const metricAvg = (pick: (m: NonNullable<ReturnType<typeof lab.metrics.get>>) => number | null, range: (d: string) => boolean) =>
      mean(
        [...lab.metrics.entries()]
          .filter(([d]) => range(d))
          .map(([, m]) => pick(m))
          .filter((v): v is number => v != null)
      );

    let recoveryRows: { local_date: string; recovery_score: number | null }[] = [];
    try {
      recoveryRows = await db.getAllAsync(
        `SELECT local_date, recovery_score FROM health_daily_metrics
         WHERE user_id = ? AND local_date >= ? AND local_date <= ?`,
        [user.id, prevStart, week.weekEnd]
      );
    } catch {}
    const recoveryAvg = (range: (d: string) => boolean) =>
      mean(recoveryRows.filter((r) => range(r.local_date) && r.recovery_score != null).map((r) => r.recovery_score!));

    let trophies: AchievementDefinition[] = [];
    try {
      const rows = await db.getAllAsync<{ achievement_id: string; unlocked_at: string }>(
        'SELECT achievement_id, unlocked_at FROM achievements WHERE user_id = ?',
        [user.id]
      );
      const ids = rows
        .filter((r) => inWeek(new Date(r.unlocked_at).toLocaleDateString('en-CA')))
        .map((r) => r.achievement_id);
      trophies = ACHIEVEMENTS.filter((a) => ids.includes(a.id));
    } catch {}

    const best = [...workouts].sort((a, b) => (b.duration ?? 0) - (a.duration ?? 0))[0];
    const minutes = Math.round(workouts.reduce((s, w) => s + (w.duration ?? 0), 0) / 60);
    const showUpRate = total > 0 ? Math.round((workouts.length / total) * 100) : null;
    const streak = await WorkoutService.getCurrentStreak().catch(() => 0);

    let mood: RecapMood;
    let headline: string;
    if (workouts.length === 0 && skips.length === 0) {
      mood = 'ghost';
      headline = 'A ghost week. Nothing scheduled, nothing done.';
    } else if (workouts.length === 0) {
      mood = 'rough';
      headline = `Zero workouts, ${skips.length} ${skips.length === 1 ? 'excuse' : 'excuses'}. Womp womp.`;
    } else if (skips.length === 0) {
      mood = 'perfect';
      headline = `Perfect week. ${workouts.length} for ${workouts.length}, no excuses.`;
    } else if (showUpRate! >= 75) {
      mood = 'solid';
      headline = `Solid week. You showed up ${showUpRate}% of the time.`;
    } else {
      mood = 'mixed';
      headline = `Mixed week: ${workouts.length} done, ${skips.length} skipped.`;
    }

    return {
      ...week,
      mood,
      headline,
      workouts: workouts.length,
      sport: workouts.filter((w) => w.activity === 'sport').length,
      skips: skips.length,
      minutes,
      showUpRate,
      streak,
      topExcuse,
      disputedExcuses,
      trophies,
      sleep: {
        avg: metricAvg((m) => m.sleep_duration_min, inWeek),
        prev: metricAvg((m) => m.sleep_duration_min, inPrev),
      },
      steps: {
        avg: metricAvg((m) => m.steps, inWeek),
        prev: metricAvg((m) => m.steps, inPrev),
      },
      recovery: { avg: recoveryAvg(inWeek), prev: recoveryAvg(inPrev) },
      bestDay: best?.duration ? { day: weekdayOf(best.workout_date), minutes: Math.round(best.duration / 60) } : null,
    };
  }

  /**
   * Whether Today should show the recap card: from Sunday noon until the
   * recap is opened, and never for a user whose account is younger than the week.
   */
  static async shouldShowCard(): Promise<boolean> {
    const today = getTodayLocal();
    const { weekStart } = recapWeek(today);
    if (weekdayOf(today) === 0 && new Date().getHours() < 12) return false;
    const user = await UserService.getCurrentUser();
    if (!user || user.created_at.slice(0, 10) > weekStart) return false;
    try {
      return (await AsyncStorage.getItem(SEEN_KEY + weekStart)) == null;
    } catch {
      return false;
    }
  }

  static async markSeen(weekStart: string): Promise<void> {
    try {
      await AsyncStorage.setItem(SEEN_KEY + weekStart, '1');
    } catch {}
  }
}
