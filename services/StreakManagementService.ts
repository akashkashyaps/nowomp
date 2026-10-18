import { database } from '@/database/database';
import { UserService } from './UserService';
import { FreezeTokenService } from './FreezeTokenService';
import { ExcuseSubmissionService } from './ExcuseSubmissionService';
import { RedemptionWorkoutService } from './RedemptionWorkoutService';
import { getTodayLocal } from '@/utils/dateUtils';

export class StreakManagementService {
  /**
   * Check for missed workouts and handle streak freeze/redemption logic
   * This should be called daily (can be triggered by app startup or scheduled)
   */
  static async processMissedWorkouts(): Promise<{
    missedWorkouts: string[];
    redemptionsTriggered: number;
    streakMaintained: boolean;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const today = getTodayLocal();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    // Get scheduled workouts for the past 7 days that haven't been completed or excused
    const pastWeek = new Date();
    pastWeek.setDate(pastWeek.getDate() - 7);

    const missedWorkouts = await db.getAllAsync<any>(
      `SELECT sw.workout_date, sw.workout_time 
       FROM scheduled_workouts sw
       WHERE sw.user_id = ? 
       AND sw.workout_date >= ? 
       AND sw.workout_date < ?
       AND NOT EXISTS (
         SELECT 1 FROM workouts w 
         WHERE w.user_id = sw.user_id 
         AND w.workout_date = sw.workout_date 
         AND w.status = 'completed'
       )
       AND NOT EXISTS (
         SELECT 1 FROM excuse_submissions es
         WHERE es.user_id = sw.user_id
         AND es.submitted_for_date = sw.workout_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM skips s
         WHERE s.user_id = sw.user_id
         AND s.skip_date = sw.workout_date
       )
       AND NOT EXISTS (
         SELECT 1 FROM redemption_workouts rw
         WHERE rw.user_id = sw.user_id
         AND rw.triggered_by_missed_date = sw.workout_date
       )
       ORDER BY sw.workout_date DESC`,
      [user.id, pastWeek.toISOString().split('T')[0], today]
    );

    let redemptionsTriggered = 0;
    let streakMaintained = true;

    for (const missed of missedWorkouts) {
      // Check if deadline for excuse submission has passed (24 hours)
      const missedDate = new Date(missed.workout_date);
      const deadlineDate = new Date(missedDate.getTime() + (24 * 60 * 60 * 1000));
      const now = new Date();

      if (now > deadlineDate) {
        // Check if there's already an active redemption for this user
        const activeRedemption = await RedemptionWorkoutService.getActiveRedemptionWorkout();
        
        if (!activeRedemption) {
          // Check redemption eligibility (once per week rule)
          const canEnterRedemption = await RedemptionWorkoutService.canEnterRedemptionMode();
          
          if (canEnterRedemption.canEnter) {
            // Trigger redemption workout
            await RedemptionWorkoutService.createRedemptionWorkout(missed.workout_date);
            redemptionsTriggered++;
            console.log(`Redemption triggered for missed workout on ${missed.workout_date}`);
          } else {
            // Reset streak - user has exhausted redemption opportunities
            await this.resetStreak();
            streakMaintained = false;
            console.log(`Streak reset due to missed workout on ${missed.workout_date} - redemption not available`);
            break; // Only reset once
          }
        }
      }
    }

    return {
      missedWorkouts: missedWorkouts.map(m => m.workout_date),
      redemptionsTriggered,
      streakMaintained,
    };
  }

  /**
   * Reset user's streak to 0
   */
  static async resetStreak(): Promise<void> {
    console.log('Resetting user streak to 0');
    // The streak is calculated dynamically from workout records, 
    // so we don't need to update a streak counter directly.
    // However, we could log this event for analytics
  }

  /**
   * Check if a workout fulfills streak requirements
   */
  static async validateWorkoutForStreak(workoutId: number): Promise<{
    countsForStreak: boolean;
    reason?: string;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return { countsForStreak: false, reason: 'No user found' };

    const workout = await db.getFirstAsync<any>(
      'SELECT * FROM workouts WHERE id = ? AND user_id = ?',
      [workoutId, user.id]
    );

    if (!workout) {
      return { countsForStreak: false, reason: 'Workout not found' };
    }

    if (workout.status !== 'completed') {
      return { countsForStreak: false, reason: 'Workout not completed' };
    }

    if (!workout.verified) {
      return { countsForStreak: false, reason: 'Workout not verified' };
    }

    // Check if there's an active redemption that this workout fulfills
    const redemptionResult = await RedemptionWorkoutService.canWorkoutFulfillRedemption(workout.workout_date);
    
    if (redemptionResult.canFulfill) {
      // This is a redemption workout - it maintains streak but doesn't increment
      return { 
        countsForStreak: true, 
        reason: 'Redemption workout - maintains streak without increment' 
      };
    }

    // Regular workout - counts for streak increment
    return { countsForStreak: true };
  }

  /**
   * Get streak status with detailed information
   */
  static async getDetailedStreakStatus(): Promise<{
    currentStreak: number;
    isInRedemptionMode: boolean;
    redemptionDeadline?: string;
    freezeTokensAvailable: number;
    nextFreezeTokenProgress: {
      currentStreak: number;
      nextMilestone: number;
      daysToNext: number;
    };
    missedWorkoutsThisWeek: number;
    canSubmitExcuse: boolean;
  }> {
    const [
      currentStreak,
      redemptionCountdown,
      freezeTokenCount,
      progressData
    ] = await Promise.all([
      this.getCurrentStreakSafe(),
      RedemptionWorkoutService.getRedemptionCountdown(),
      FreezeTokenService.getAvailableTokenCount(),
      FreezeTokenService.getProgressToNextToken(await this.getCurrentStreakSafe()),
    ]);

    // Count missed workouts this week
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const user = await UserService.getCurrentUser();
    let missedWorkoutsThisWeek = 0;

    if (user) {
      const db = await database.getDatabase();
      const result = await db.getFirstAsync<{count: number}>(
        `SELECT COUNT(*) as count FROM excuse_submissions 
         WHERE user_id = ? AND submitted_at >= ?`,
        [user.id, oneWeekAgo.toISOString()]
      );
      missedWorkoutsThisWeek = result?.count || 0;
    }

    // Check if user can submit excuse for today
    const today = getTodayLocal();
    const canSubmitResult = await ExcuseSubmissionService.canSubmitExcuseForDate(today);

    return {
      currentStreak,
      isInRedemptionMode: redemptionCountdown?.isActive || false,
      redemptionDeadline: redemptionCountdown?.deadline,
      freezeTokensAvailable: freezeTokenCount,
      nextFreezeTokenProgress: {
        currentStreak: progressData.currentStreak,
        nextMilestone: progressData.nextMilestone,
        daysToNext: progressData.daysToNext,
      },
      missedWorkoutsThisWeek,
      canSubmitExcuse: canSubmitResult.canSubmit,
    };
  }

  /**
   * Safe wrapper for getCurrentStreak that handles errors
   */
  private static async getCurrentStreakSafe(): Promise<number> {
    try {
      const { WorkoutService } = await import('./WorkoutService');
      return await WorkoutService.getCurrentStreak();
    } catch (error) {
      console.error('Error getting current streak:', error);
      return 0;
    }
  }

  /**
   * Handle expired freeze tokens cleanup
   */
  static async cleanupExpiredTokens(): Promise<void> {
    try {
      const cleaned = await FreezeTokenService.cleanupExpiredTokens();
      if (cleaned > 0) {
        console.log(`Cleaned up ${cleaned} expired freeze tokens`);
      }
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
    }
  }

  /**
   * Check failed redemption workouts and reset streaks
   */
  static async processFailedRedemptions(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return 0;

    const now = new Date().toISOString();
    
    // Find active redemptions that have passed their deadline
    const expiredRedemptions = await db.getAllAsync<any>(
      'SELECT * FROM redemption_workouts WHERE user_id = ? AND status = ? AND deadline < ?',
      [user.id, 'active', now]
    );

    let failedCount = 0;
    for (const redemption of expiredRedemptions) {
      await RedemptionWorkoutService.markRedemptionFailed(redemption.id);
      failedCount++;
      console.log(`Redemption failed for ID ${redemption.id}, deadline was ${redemption.deadline}`);
    }

    if (failedCount > 0) {
      // Reset streak since redemption failed
      await this.resetStreak();
    }

    return failedCount;
  }

  /**
   * Comprehensive daily maintenance routine
   */
  static async performDailyMaintenance(): Promise<{
    missedWorkoutsProcessed: number;
    redemptionsTriggered: number;
    failedRedemptions: number;
    expiredTokensCleaned: number;
    streakReset: boolean;
  }> {
    console.log('Starting daily streak maintenance...');

    // Process failed redemptions first, then missed workouts.
    // Order matters: creating new redemptions checks for active ones,
    // so old ones must be marked failed before new ones can be created.
    const failedRedemptions = await this.processFailedRedemptions();
    const missedResult = await this.processMissedWorkouts();

    const expiredTokensCleaned = await FreezeTokenService.cleanupExpiredTokens();

    const result = {
      missedWorkoutsProcessed: missedResult.missedWorkouts.length,
      redemptionsTriggered: missedResult.redemptionsTriggered,
      failedRedemptions,
      expiredTokensCleaned,
      streakReset: !missedResult.streakMaintained || failedRedemptions > 0,
    };

    console.log('Daily maintenance completed:', result);
    return result;
  }
}