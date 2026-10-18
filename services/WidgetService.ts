import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { WorkoutService } from './WorkoutService';
import { ScheduledWorkoutService } from './ScheduledWorkoutService';
import { FreezeTokenService } from './FreezeTokenService';
import { RedemptionWorkoutService } from './RedemptionWorkoutService';
import { DailyMaintenanceService } from './DailyMaintenanceService';
import { computeWidgetView, pokeView, type MoodSnapshot, type WidgetView } from './widgetMood';
import { getTodayLocal } from '@/utils/dateUtils';

/**
 * Feeds the home-screen widget.
 *
 * The widget renders from a small snapshot in AsyncStorage rather than querying
 * SQLite itself: its handler can run headless while the app is closed, and a
 * second database connection from there could contend with the app's own. The
 * app refreshes the snapshot whenever the day's status changes; the widget's
 * 30-minute refresh re-reads it, so the penguin's mood still moves with the
 * clock while the app is closed.
 */

export type WidgetSnapshot = MoodSnapshot;

export const WIDGET_NAME = 'StreakWidget';
const KEY = '@widget_snapshot_v2';
const POKE_KEY = '@widget_pokes';
/** Pokes older than this start the escalation over. */
const POKE_RESET_MS = 5 * 60 * 1000;

/**
 * Adjust a snapshot computed on an earlier day. A workout that was still
 * pending when the app was last open, and is now in the past, was missed
 * (finishing or excusing it would have refreshed the snapshot).
 */
export const resolveForToday = (snap: WidgetSnapshot | null): WidgetSnapshot | null => {
  if (!snap) return null;
  const today = getTodayLocal();
  if (snap.date === today) return snap;
  if (snap.status === 'scheduled' || snap.status === 'in_progress' || snap.status === 'missed') {
    return { ...snap, date: today, status: 'missed', time: null };
  }
  const todays = snap.upcoming.find((u) => u.date === today);
  return { ...snap, date: today, status: todays ? 'scheduled' : 'rest', time: todays?.time ?? null, excuse: null };
};

export class WidgetService {
  static async readSnapshot(): Promise<WidgetSnapshot | null> {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? resolveForToday(JSON.parse(raw)) : null;
    } catch {
      return null;
    }
  }

  /** The view for right now, from the stored snapshot. */
  static async currentView(): Promise<{ view: WidgetView; streak: number | null }> {
    const snap = await this.readSnapshot();
    return { view: computeWidgetView(snap, new Date()), streak: snap?.streak ?? null };
  }

  /** Count a poke; returns the view to show while he's annoyed. */
  static async poke(): Promise<{ view: WidgetView; streak: number | null }> {
    let count = 1;
    try {
      const raw = await AsyncStorage.getItem(POKE_KEY);
      const prev = raw ? (JSON.parse(raw) as { count: number; at: number }) : null;
      count = prev && Date.now() - prev.at < POKE_RESET_MS ? prev.count + 1 : 1;
      await AsyncStorage.setItem(POKE_KEY, JSON.stringify({ count, at: Date.now() }));
    } catch {}
    const snap = await this.readSnapshot();
    return { view: pokeView(count), streak: snap?.streak ?? null };
  }

  /** Recompute today's status and redraw any widgets on the home screen. */
  static async refresh(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      const today = getTodayLocal();
      const [streak, current, status, scheduled, all, tokens, redemption, pending] = await Promise.all([
        WorkoutService.getCurrentStreak(),
        WorkoutService.getCurrentWorkout(),
        WorkoutService.getTodayStatus(),
        WorkoutService.getTodayScheduledWorkout(),
        ScheduledWorkoutService.getAllScheduledWorkouts(),
        FreezeTokenService.getAvailableTokenCount().catch(() => 0),
        RedemptionWorkoutService.canEnterRedemptionMode().catch(() => ({ canEnter: false })),
        DailyMaintenanceService.getPendingExcuseDate().catch(() => null),
      ]);
      const snapshot: WidgetSnapshot = {
        date: today,
        streak,
        status: pending
          ? 'missed'
          : current
            ? 'in_progress'
            : status.hasCompleted
              ? 'done'
              : status.hasSkipped
                ? 'skipped'
                : scheduled
                  ? 'scheduled'
                  : 'rest',
        time: scheduled?.time ?? null,
        upcoming: all
          .filter((w) => w.workout_date >= today)
          .slice(0, 14)
          .map((w) => ({ date: w.workout_date, time: w.workout_time })),
        excuse: status.skipReason ?? null,
        // Only claim "your streak dies at midnight" when it actually would.
        atRisk: streak > 0 && tokens === 0 && !redemption.canEnter,
      };
      await AsyncStorage.setItem(KEY, JSON.stringify(snapshot));
      await this.render({ view: computeWidgetView(snapshot, new Date()), streak });
    } catch (error) {
      console.log('Widget refresh skipped:', error);
    }
  }

  private static async render(props: { view: WidgetView; streak: number | null }) {
    // Loaded lazily so the native module is never touched on web.
    const [{ requestWidgetUpdate }, { StreakWidget }, React] = await Promise.all([
      import('react-native-android-widget'),
      import('@/widgets/StreakWidget'),
      import('react'),
    ]);
    await requestWidgetUpdate({
      widgetName: WIDGET_NAME,
      // Each placed widget gets its own size, so a 1x1 and a 2x2 lay out differently.
      renderWidget: (info) =>
        React.createElement(StreakWidget, { ...props, width: info.width, height: info.height }),
    });
  }
}
