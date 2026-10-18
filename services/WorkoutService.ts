import { database, Workout, PlaceType } from '@/database/database';
import { UserService } from './UserService';
import { getTodayLocal, getLocalDateString, logTimezoneInfo } from '@/utils/dateUtils';
import { ScheduledWorkoutService } from './ScheduledWorkoutService';
import { FreezeTokenService } from './FreezeTokenService';
import { RedemptionWorkoutService } from './RedemptionWorkoutService';
import { NotificationService } from './NotificationService';

export class WorkoutService {
  /** Starts a session at a saved place; the place's type decides whether it's a workout or sport. */
  static async startWorkout(at?: { activity: PlaceType; placeName: string }): Promise<Workout> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) throw new Error('No user found');

    // Use local timezone consistently
    const today = getTodayLocal();
    const now = new Date().toISOString();
    
    // Debug timezone info
    logTimezoneInfo();
    console.log('Starting workout for date:', today);

    // CRITICAL: Check if user already made an excuse today - can't workout if you already skipped!
    const existingSkip = await db.getFirstAsync(
      'SELECT * FROM skips WHERE user_id = ? AND skip_date = ?',
      [user.id, today]
    );

    if (existingSkip) {
      throw new Error('You already made an excuse today! You can\'t workout after making an excuse. Choose better tomorrow! 🤷‍♂️');
    }

    // Check if already worked out today
    const existingWorkout = await db.getFirstAsync<Workout>(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status IN (?, ?)',
      [user.id, today, 'in_progress', 'completed']
    );

    if (existingWorkout) {
      if (existingWorkout.status === 'completed') {
        throw new Error('Already completed workout today!');
      }
      // If in_progress, return the existing workout
      return existingWorkout;
    }

    // Create the workout entry
    const result = await db.runAsync(
      'INSERT INTO workouts (user_id, verified, workout_date, status, started_at, activity, place_name) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user.id, true, today, 'in_progress', now, at?.activity ?? null, at?.placeName ?? null]
    );

    const workout = await db.getFirstAsync<Workout>(
      'SELECT * FROM workouts WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!workout) throw new Error('Failed to create workout');

    console.log('Workout created successfully for date:', today);

    // Cancel redemption reminder notifications when workout starts
    try {
      await NotificationService.cancelRedemptionReminders();
      console.log('Cancelled redemption reminders since workout has started');
    } catch (error) {
      console.error('Error cancelling redemption reminders:', error);
      // Don't fail workout start if notification cancellation fails
    }

    return workout;
  }

  static async endWorkout(workoutId: number): Promise<Workout> {
    const db = await database.getDatabase();
    const now = new Date().toISOString();

    const workout = await db.getFirstAsync<Workout>(
      'SELECT * FROM workouts WHERE id = ?',
      [workoutId]
    );

    if (!workout) throw new Error('Workout not found');
    if (workout.status === 'completed') throw new Error('Workout already completed');

    const startTime = new Date(workout.started_at!);
    const endTime = new Date(now);
    const duration = Math.floor((endTime.getTime() - startTime.getTime()) / 1000);

    await db.runAsync(
      'UPDATE workouts SET status = ?, ended_at = ?, duration = ? WHERE id = ?',
      ['completed', now, duration, workoutId]
    );

    const updatedWorkout = await db.getFirstAsync<Workout>(
      'SELECT * FROM workouts WHERE id = ?',
      [workoutId]
    );

    if (!updatedWorkout) throw new Error('Failed to update workout');

    // Check if this workout fulfills a redemption requirement
    try {
      const redemptionResult = await RedemptionWorkoutService.canWorkoutFulfillRedemption(updatedWorkout.workout_date);
      if (redemptionResult.canFulfill && redemptionResult.redemptionWorkout) {
        await RedemptionWorkoutService.completeRedemptionWorkout(
          redemptionResult.redemptionWorkout.id,
          updatedWorkout.id
        );
        console.log('Redemption workout completed with workout:', updatedWorkout.id);
      }
    } catch (error) {
      console.warn('Error handling redemption workout completion:', error);
    }

    // Check for freeze token earning (every 15 streak days)
    try {
      const currentStreak = await this.getCurrentStreak();
      const newToken = await FreezeTokenService.checkAndAwardFreezeToken(currentStreak);
      if (newToken) {
        console.log('Freeze token earned at streak:', currentStreak);
      }

      // Update highest streak if current streak is higher
      await UserService.updateHighestStreak(currentStreak);
    } catch (error) {
      console.warn('Error checking freeze token earning:', error);
    }

    // Clear the scheduled workout for today since the workout is now completed
    // This prevents scheduling another workout on the same day (streak manipulation prevention)
    try {
      const today = getTodayLocal();
      const scheduledWorkout = await ScheduledWorkoutService.getScheduledWorkout(today);
      if (scheduledWorkout) {
        await ScheduledWorkoutService.removeScheduledWorkout(today);
        console.log('Scheduled workout cleared for today after completion:', today);
      }
    } catch (error) {
      console.warn('Could not clear scheduled workout after completion:', error);
      // Don't fail the workout completion if scheduled workout clearing fails
    }

    return updatedWorkout;
  }

  static async getCurrentWorkout(): Promise<Workout | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return null;

    const today = getTodayLocal();

    const workout = await db.getFirstAsync<Workout>(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
      [user.id, today, 'in_progress']
    );

    return workout || null;
  }

  static async hasCompletedWorkoutToday(): Promise<boolean> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return false;

    const today = getTodayLocal();

    const completedWorkout = await db.getFirstAsync<Workout>(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
      [user.id, today, 'completed']
    );

    return completedWorkout !== null;
  }

  static async getTodayStatus(): Promise<{hasCompleted: boolean, hasSkipped: boolean, skipReason?: string}> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return {hasCompleted: false, hasSkipped: false};

    const today = getTodayLocal();

    const [completedWorkout, skip] = await Promise.all([
      db.getFirstAsync<Workout>(
        'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
        [user.id, today, 'completed']
      ),
      db.getFirstAsync<any>(
        'SELECT * FROM skips WHERE user_id = ? AND skip_date = ?',
        [user.id, today]
      )
    ]);

    return {
      hasCompleted: completedWorkout !== null,
      hasSkipped: skip !== null,
      skipReason: skip?.excuse || undefined
    };
  }

  static async getCurrentStreak(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return 0;

    const today = getTodayLocal();
    const now = new Date().toISOString();

    // Get all completed, verified workouts (use literal 1 for SQLite boolean)
    const workouts = await db.getAllAsync<{workout_date: string}>(
      `SELECT workout_date FROM workouts WHERE user_id = ? AND verified = 1 AND status = 'completed' ORDER BY workout_date DESC`,
      [user.id]
    );

    if (workouts.length === 0) return 0;

    // Find the most recent streak-breaking event from ALL sources.
    // A streak breaks when:
    //   (a) A scheduled workout was missed with no valid excuse/skip/completed-redemption
    //   (b) A redemption workout failed or expired
    // We collect the cutoff date from each source and take the most recent one.

    // Source 1: Missed scheduled workouts (no completion, no excuse, no skip,
    // and no redemption at all — or only a failed one)
    const missedScheduled = await db.getFirstAsync<{workout_date: string}>(
      `SELECT sw.workout_date
       FROM scheduled_workouts sw
       WHERE sw.user_id = ?
       AND sw.workout_date < ?
       AND NOT EXISTS (
         SELECT 1 FROM workouts w
         WHERE w.user_id = sw.user_id AND w.workout_date = sw.workout_date
         AND w.status = 'completed' AND w.verified = 1
       )
       AND NOT EXISTS (
         SELECT 1 FROM excuse_submissions es
         WHERE es.user_id = sw.user_id AND es.submitted_for_date = sw.workout_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM skips s
         WHERE s.user_id = sw.user_id AND s.skip_date = sw.workout_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM redemption_workouts rw
         WHERE rw.user_id = sw.user_id AND rw.triggered_by_missed_date = sw.workout_date
         AND rw.status = 'completed'
       )
       ORDER BY sw.workout_date DESC
       LIMIT 1`,
      [user.id, today]
    );

    // Source 2: Failed or expired redemption workouts.
    // Use the deadline as the cutoff (not the missed date) so workouts
    // done during the redemption window don't count toward a new streak.
    const failedRedemption = await db.getFirstAsync<{deadline: string}>(
      `SELECT deadline
       FROM redemption_workouts
       WHERE user_id = ?
       AND (status = 'failed' OR (status = 'active' AND deadline < ?))
       ORDER BY deadline DESC
       LIMIT 1`,
      [user.id, now]
    );

    // Determine the most recent break date from all sources
    const breakDates: string[] = [];

    if (missedScheduled) {
      breakDates.push(missedScheduled.workout_date);
    }
    if (failedRedemption) {
      // deadline is ISO timestamp — extract date portion for comparison
      breakDates.push(failedRedemption.deadline.split('T')[0]);
    }

    if (breakDates.length > 0) {
      // Take the most recent break — only workouts AFTER this date count
      breakDates.sort();
      const breakDate = breakDates[breakDates.length - 1];
      return workouts.filter(w => w.workout_date > breakDate).length;
    }

    // No streak breaks found — all completed workouts count
    return workouts.length;
  }

  /** Recent completed workouts, newest first — used as AI analysis context. */
  static async getRecentWorkouts(
    days = 30
  ): Promise<{ workout_date: string; duration: number | null; verified: boolean }[]> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffDate = cutoff.toLocaleDateString('en-CA');

      return await db.getAllAsync<{
        workout_date: string;
        duration: number | null;
        verified: boolean;
      }>(
        `SELECT workout_date, duration, verified FROM workouts
         WHERE user_id = ? AND status = 'completed' AND workout_date >= ?
         ORDER BY workout_date DESC`,
        [user.id, cutoffDate]
      );
    } catch {
      return [];
    }
  }

  static async getTotalVerifiedWorkouts(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return 0;

    const result = await db.getFirstAsync<{count: number}>(
      'SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND verified = ? AND status = ?',
      [user.id, true, 'completed']
    );

    return result?.count || 0;
  }

  /** Verified sessions split into workouts (gym and home) and sport. */
  static async getSessionCounts(): Promise<{ workouts: number; sport: number }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return { workouts: 0, sport: 0 };

    const result = await db.getFirstAsync<{ workouts: number; sport: number }>(
      `SELECT COALESCE(SUM(CASE WHEN activity = 'sport' THEN 0 ELSE 1 END), 0) AS workouts,
              COALESCE(SUM(CASE WHEN activity = 'sport' THEN 1 ELSE 0 END), 0) AS sport
       FROM workouts WHERE user_id = ? AND verified = ? AND status = ?`,
      [user.id, true, 'completed']
    );
    return { workouts: result?.workouts ?? 0, sport: result?.sport ?? 0 };
  }

  /**
   * Average session length in seconds. Pass 'sport' for sport sessions;
   * anything else averages workouts only, so a 90-minute match doesn't
   * inflate the gym average.
   */
  static async getAverageGymDuration(kind: 'workout' | 'sport' = 'workout'): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return 0;

    const result = await db.getFirstAsync<{avg_duration: number}>(
      `SELECT AVG(duration) as avg_duration FROM workouts
       WHERE user_id = ? AND verified = ? AND status = ? AND duration IS NOT NULL
       AND ${kind === 'sport' ? "activity = 'sport'" : "(activity IS NULL OR activity != 'sport')"}`,
      [user.id, true, 'completed']
    );

    return Math.round(result?.avg_duration || 0);
  }

  static async getThisWeekWorkouts(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return 0;

    // Get the start of the current week (Sunday)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 (Sunday) to 6 (Saturday)
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - dayOfWeek);
    startOfWeek.setHours(0, 0, 0, 0);

    const startOfWeekString = getLocalDateString(startOfWeek);

    const result = await db.getFirstAsync<{count: number}>(
      'SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND verified = ? AND status = ? AND workout_date >= ?',
      [user.id, true, 'completed', startOfWeekString]
    );

    return result?.count || 0;
  }

  static async getTodayScheduledWorkout(): Promise<{time: string, date: string} | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return null;

    const today = getTodayLocal();

    // First check for specific scheduled workout for today
    const scheduledWorkout = await db.getFirstAsync<any>(
      'SELECT workout_time, workout_date FROM scheduled_workouts WHERE user_id = ? AND workout_date = ?',
      [user.id, today]
    );

    // Only log when no workout found for debugging
    if (!scheduledWorkout) {
      console.log('No scheduled workout found for today:', today);
    }

    if (scheduledWorkout) {
      return {
        time: scheduledWorkout.workout_time,
        date: scheduledWorkout.workout_date
      };
    }

    // If no specific scheduled workout, check general schedule
    const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

    const schedule = await db.getFirstAsync<{workout_days: string, workout_time: string}>(
      'SELECT workout_days, workout_time FROM schedules WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [user.id]
    );

    if (!schedule) return null;

    const workoutDays = JSON.parse(schedule.workout_days);
    if (workoutDays.includes(dayName)) {
      return {
        time: schedule.workout_time,
        date: today
      };
    }

    return null;
  }

  /**
   * DEPRECATED: Replaced by DailyMaintenanceService
   * This method is no longer used - maintenance now runs automatically via DailyMaintenanceService
   */
  static async performStartupMaintenance(): Promise<void> {
    // No longer used - see DailyMaintenanceService.checkAndRunMaintenance()
    console.log('performStartupMaintenance is deprecated - use DailyMaintenanceService');
  }
}