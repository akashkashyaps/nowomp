import { database, RedemptionWorkout, ExcuseSubmission } from '@/database/database';
import { UserService } from './UserService';
import { getTodayLocal } from '@/utils/dateUtils';
import { NotificationService } from './NotificationService';
import { ScheduledWorkoutService } from './ScheduledWorkoutService';

export class RedemptionWorkoutService {
  private static readonly REDEMPTION_WINDOW_HOURS = 48;

  /**
   * Determine redemption type based on upcoming scheduled workouts
   * Returns type, target date, deadline, and user-friendly message
   */
  private static async determineRedemptionType(missedDate: string): Promise<{
    redemptionType: 'next_scheduled' | 'unscheduled';
    targetWorkoutDate: string | null;
    startsAt: Date;
    deadline: Date;
  }> {
    const now = new Date();
    const fortyEightHoursFromNow = new Date(now.getTime() + (this.REDEMPTION_WINDOW_HOURS * 60 * 60 * 1000));

    // Get all upcoming scheduled workouts
    const allScheduled = await ScheduledWorkoutService.getAllScheduledWorkouts();

    // Filter to only future workouts and sort by date
    const todayLocal = getTodayLocal();
    const upcomingWorkouts = allScheduled
      .filter(w => w.workout_date > todayLocal)
      .sort((a, b) => a.workout_date.localeCompare(b.workout_date));

    // Check if first upcoming workout is within next 48 hours
    if (upcomingWorkouts.length > 0) {
      const nextWorkout = upcomingWorkouts[0];
      const nextWorkoutDate = new Date(nextWorkout.workout_date + 'T' + nextWorkout.workout_time);

      if (nextWorkoutDate <= fortyEightHoursFromNow) {
        // Use next scheduled workout as redemption target
        // Deadline is end of that workout's day (23:59:59)
        const deadline = new Date(nextWorkout.workout_date + 'T23:59:59');

        return {
          redemptionType: 'next_scheduled',
          targetWorkoutDate: nextWorkout.workout_date,
          startsAt: now, // Can start immediately
          deadline: deadline
        };
      }
    }

    // No scheduled workout in next 48 hours - use unscheduled redemption
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(0, 0, 0, 0); // Midnight tomorrow

    const deadline = new Date(tomorrow.getTime() + (this.REDEMPTION_WINDOW_HOURS * 60 * 60 * 1000));

    return {
      redemptionType: 'unscheduled',
      targetWorkoutDate: null,
      startsAt: tomorrow,
      deadline: deadline
    };
  }

  /**
   * Create a redemption workout for missed workout/excuse
   * Automatically determines if user can use next scheduled workout or needs unscheduled
   */
  static async createRedemptionWorkout(
    missedDate: string,
    excuseId?: number
  ): Promise<RedemptionWorkout> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    // SAFEGUARD 1: Validate input parameters
    if (!missedDate || missedDate.trim() === '') {
      throw new Error('Invalid missed date provided');
    }

    // SAFEGUARD 2: Check if redemption already exists for this missed date
    const existingRedemption = await db.getFirstAsync<RedemptionWorkout>(
      'SELECT * FROM redemption_workouts WHERE user_id = ? AND triggered_by_missed_date = ?',
      [user.id, missedDate]
    );
    
    if (existingRedemption) {
      console.log(`Redemption already exists for date ${missedDate}, returning existing record`);
      return existingRedemption;
    }

    // SAFEGUARD 3: Check if there's already an active redemption
    const activeRedemption = await this.getActiveRedemptionWorkout();
    if (activeRedemption) {
      throw new Error('Cannot create redemption workout: You already have an active redemption period');
    }

    // SAFEGUARD 4: Validate missed date is not in the future (use local time, not UTC)
    const todayLocal = getTodayLocal();
    if (missedDate > todayLocal) {
      throw new Error('Cannot create redemption workout for future dates');
    }

    // SAFEGUARD 5: Check 7-day limit for redemption creation
    const canEnter = await this.canEnterRedemptionMode();
    if (!canEnter.canEnter) {
      throw new Error(canEnter.reason || 'Cannot enter redemption mode at this time');
    }

    // SAFEGUARD 6: If excuse ID provided, verify it exists and doesn't already have a redemption
    if (excuseId) {
      const excuse = await db.getFirstAsync<ExcuseSubmission>(
        'SELECT * FROM excuse_submissions WHERE id = ? AND user_id = ?',
        [excuseId, user.id]
      );
      
      if (!excuse) {
        throw new Error('Invalid excuse ID provided');
      }
      
      if (excuse.freeze_token_used) {
        throw new Error('Cannot create redemption for excuse that used a freeze token');
      }
      
      if (excuse.redemption_triggered) {
        console.log('Redemption already triggered for this excuse, skipping creation');
        throw new Error('Redemption already triggered for this excuse');
      }
    }

    const now = new Date();

    // Determine redemption type based on scheduled workouts
    const redemptionInfo = await this.determineRedemptionType(missedDate);

    try {
      const result = await db.runAsync(
        `INSERT INTO redemption_workouts
         (user_id, triggered_by_excuse_id, triggered_by_missed_date, triggered_at, starts_at, deadline, status, redemption_type, target_workout_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          excuseId || null,
          missedDate,
          now.toISOString(),
          redemptionInfo.startsAt.toISOString(),
          redemptionInfo.deadline.toISOString(),
          'active',
          redemptionInfo.redemptionType,
          redemptionInfo.targetWorkoutDate
        ]
      );

      const redemptionWorkout = await db.getFirstAsync<RedemptionWorkout>(
        'SELECT * FROM redemption_workouts WHERE id = ?',
        [result.lastInsertRowId]
      );

      if (!redemptionWorkout) throw new Error('Failed to create redemption workout');

      console.log(`Redemption workout created safely. Type: ${redemptionInfo.redemptionType}, Starts: ${redemptionInfo.startsAt.toISOString()}, Deadline: ${redemptionInfo.deadline.toISOString()}`);
      if (redemptionInfo.targetWorkoutDate) {
        console.log(`Target workout date: ${redemptionInfo.targetWorkoutDate}`);
      }

      // Schedule redemption reminder notifications (every 10 hours until deadline)
      try {
        await NotificationService.scheduleRedemptionReminders(redemptionInfo.deadline.toISOString());
        console.log('Redemption reminder notifications scheduled');
      } catch (error) {
        console.error('Error scheduling redemption reminders:', error);
        // Don't fail the redemption creation if notifications fail
      }

      return redemptionWorkout;
    } catch (error) {
      console.error('Error creating redemption workout:', error);
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Failed to create redemption workout: ${message}`);
    }
  }

  /**
   * Get active redemption workout for user
   */
  static async getActiveRedemptionWorkout(): Promise<RedemptionWorkout | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return null;

    const redemption = await db.getFirstAsync<RedemptionWorkout>(
      'SELECT * FROM redemption_workouts WHERE user_id = ? AND status = ? ORDER BY triggered_at DESC LIMIT 1',
      [user.id, 'active']
    );

    if (!redemption) return null;

    // Check if deadline has passed
    const now = new Date();
    const deadline = new Date(redemption.deadline);
    
    if (now > deadline) {
      // Mark as failed
      await this.markRedemptionFailed(redemption.id);
      return null;
    }

    return redemption;
  }

  /**
   * Complete a redemption workout
   */
  static async completeRedemptionWorkout(
    redemptionId: number,
    completedWorkoutId: number
  ): Promise<RedemptionWorkout> {
    const db = await database.getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE redemption_workouts SET status = ?, completed_at = ?, completed_workout_id = ? WHERE id = ?',
      ['completed', now, completedWorkoutId, redemptionId]
    );

    const updatedRedemption = await db.getFirstAsync<RedemptionWorkout>(
      'SELECT * FROM redemption_workouts WHERE id = ?',
      [redemptionId]
    );

    if (!updatedRedemption) throw new Error('Failed to update redemption workout');

    console.log('Redemption workout completed successfully');

    // Cancel redemption reminder notifications when redemption is completed
    try {
      await NotificationService.cancelRedemptionReminders();
      console.log('Cancelled redemption reminders since redemption is completed');
    } catch (error) {
      console.error('Error cancelling redemption reminders:', error);
      // Don't fail redemption completion if notification cancellation fails
    }

    return updatedRedemption;
  }

  /**
   * Mark redemption workout as failed
   */
  static async markRedemptionFailed(redemptionId: number): Promise<void> {
    const db = await database.getDatabase();

    await db.runAsync(
      'UPDATE redemption_workouts SET status = ? WHERE id = ?',
      ['failed', redemptionId]
    );

    console.log('Redemption workout marked as failed');

    // Cancel redemption reminder notifications when redemption fails
    try {
      await NotificationService.cancelRedemptionReminders();
      console.log('Cancelled redemption reminders since redemption failed');
    } catch (error) {
      console.error('Error cancelling redemption reminders:', error);
      // Don't fail the failure marking if notification cancellation fails
    }
  }

  /**
   * Check if workout can fulfill redemption requirement
   * For next_scheduled type: workout date must match target date
   * For unscheduled type: any workout within window counts
   */
  static async canWorkoutFulfillRedemption(workoutDate: string): Promise<{
    canFulfill: boolean;
    redemptionWorkout?: RedemptionWorkout;
  }> {
    const activeRedemption = await this.getActiveRedemptionWorkout();

    if (!activeRedemption) {
      return { canFulfill: false };
    }

    // Redemption period is from starts_at to deadline
    const startsAt = new Date(activeRedemption.starts_at);
    const deadline = new Date(activeRedemption.deadline);
    const now = new Date();

    // Check if redemption period has started
    if (now < startsAt) {
      console.log('Redemption period has not started yet');
      return { canFulfill: false };
    }

    // Check if we're past the deadline
    if (now > deadline) {
      console.log('Redemption period has expired');
      return { canFulfill: false };
    }

    const workoutDateString = workoutDate.split('T')[0]; // Get just the date part

    // For next_scheduled type: workout must match the target date
    if (activeRedemption.redemption_type === 'next_scheduled') {
      if (workoutDateString === activeRedemption.target_workout_date) {
        console.log('Workout matches target date for next_scheduled redemption');
        return {
          canFulfill: true,
          redemptionWorkout: activeRedemption,
        };
      } else {
        console.log('Workout does not match target date for next_scheduled redemption');
        return { canFulfill: false };
      }
    }

    // For unscheduled type: any workout within the window counts
    console.log('Checking unscheduled redemption fulfillment:', {
      workoutDate: workoutDateString,
      startsAt: startsAt.toISOString(),
      deadline: deadline.toISOString(),
      now: now.toISOString()
    });

    return {
      canFulfill: true,
      redemptionWorkout: activeRedemption,
    };
  }

  /**
   * Get redemption countdown info with support for pre-start and active periods
   */
  static async getRedemptionCountdown(): Promise<{
    isActive: boolean;
    hasStarted?: boolean;
    timeRemaining?: number; // milliseconds
    timeToStart?: number; // milliseconds until redemption starts
    deadline?: string;
    startsAt?: string;
    redemptionWorkout?: RedemptionWorkout;
    hoursRemaining?: number;
    minutesRemaining?: number;
    hoursToStart?: number;
    minutesToStart?: number;
  } | null> {
    const activeRedemption = await this.getActiveRedemptionWorkout();
    
    if (!activeRedemption) {
      return { isActive: false };
    }

    const now = new Date();
    const startsAt = new Date(activeRedemption.starts_at);
    const deadline = new Date(activeRedemption.deadline);
    
    // Check if deadline has passed
    if (now > deadline) {
      await this.markRedemptionFailed(activeRedemption.id);
      return { isActive: false };
    }

    // Check if redemption period has started
    const hasStarted = now >= startsAt;
    
    if (hasStarted) {
      // Redemption period is active - show countdown to deadline
      const timeRemaining = deadline.getTime() - now.getTime();
      const hoursRemaining = Math.floor(timeRemaining / (1000 * 60 * 60));
      const minutesRemaining = Math.floor((timeRemaining % (1000 * 60 * 60)) / (1000 * 60));

      return {
        isActive: true,
        hasStarted: true,
        timeRemaining,
        deadline: deadline.toISOString(),
        startsAt: startsAt.toISOString(),
        redemptionWorkout: activeRedemption,
        hoursRemaining,
        minutesRemaining,
      };
    } else {
      // Redemption hasn't started yet - show countdown to start
      const timeToStart = startsAt.getTime() - now.getTime();
      const hoursToStart = Math.floor(timeToStart / (1000 * 60 * 60));
      const minutesToStart = Math.floor((timeToStart % (1000 * 60 * 60)) / (1000 * 60));

      return {
        isActive: true,
        hasStarted: false,
        timeToStart,
        deadline: deadline.toISOString(),
        startsAt: startsAt.toISOString(),
        redemptionWorkout: activeRedemption,
        hoursToStart,
        minutesToStart,
      };
    }
  }

  /**
   * Get redemption workout history
   */
  static async getRedemptionHistory(): Promise<{
    redemption: RedemptionWorkout;
    excuse?: any;
    workout?: any;
  }[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];

    const redemptions = await db.getAllAsync<RedemptionWorkout>(
      'SELECT * FROM redemption_workouts WHERE user_id = ? ORDER BY triggered_at DESC',
      [user.id]
    );

    const history = [];
    for (const redemption of redemptions) {
      let excuse = null;
      let workout = null;

      if (redemption.triggered_by_excuse_id) {
        excuse = await db.getFirstAsync(
          'SELECT * FROM excuse_submissions WHERE id = ?',
          [redemption.triggered_by_excuse_id]
        );
      }

      if (redemption.completed_workout_id) {
        workout = await db.getFirstAsync(
          'SELECT * FROM workouts WHERE id = ?',
          [redemption.completed_workout_id]
        );
      }

      history.push({
        redemption,
        excuse,
        workout,
      });
    }

    return history;
  }

  /**
   * Get redemption statistics
   * Note: totalRedemptions only counts COMPLETED redemptions (successfully fulfilled)
   */
  static async getRedemptionStats(): Promise<{
    totalRedemptions: number;
    completedRedemptions: number;
    failedRedemptions: number;
    successRate: number;
    activeRedemptions: number;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return {
      totalRedemptions: 0,
      completedRedemptions: 0,
      failedRedemptions: 0,
      successRate: 0,
      activeRedemptions: 0,
    };

    const [completed, failed, active] = await Promise.all([
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM redemption_workouts WHERE user_id = ? AND status = ?',
        [user.id, 'completed']
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM redemption_workouts WHERE user_id = ? AND status = ?',
        [user.id, 'failed']
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM redemption_workouts WHERE user_id = ? AND status = ?',
        [user.id, 'active']
      ),
    ]);

    const completedCount = completed?.count || 0;
    const failedCount = failed?.count || 0;

    // Total redemptions = only completed ones (successfully fulfilled redemptions)
    // Success rate = completed / (completed + failed) - excludes active redemptions
    const totalAttempts = completedCount + failedCount;
    const successRate = totalAttempts > 0 ? (completedCount / totalAttempts) * 100 : 0;

    return {
      totalRedemptions: completedCount,
      completedRedemptions: completedCount,
      failedRedemptions: failed?.count || 0,
      successRate: Math.round(successRate * 100) / 100,
      activeRedemptions: active?.count || 0,
    };
  }

  /**
   * Check if user can enter redemption mode (once per week restriction)
   */
  static async canEnterRedemptionMode(): Promise<{
    canEnter: boolean;
    reason?: string;
    nextAvailableDate?: string;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return { canEnter: false, reason: 'No user found' };

    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const recentRedemption = await db.getFirstAsync<RedemptionWorkout>(
      'SELECT * FROM redemption_workouts WHERE user_id = ? AND triggered_at > ? ORDER BY triggered_at DESC LIMIT 1',
      [user.id, oneWeekAgo.toISOString()]
    );

    if (!recentRedemption) {
      return { canEnter: true };
    }

    const nextAvailable = new Date(recentRedemption.triggered_at);
    nextAvailable.setDate(nextAvailable.getDate() + 7);

    return {
      canEnter: false,
      reason: 'You can only enter redemption mode once per 7-day period',
      nextAvailableDate: nextAvailable.toISOString(),
    };
  }

  /**
   * Clean up old redemption workouts (maintenance function)
   */
  static async cleanupOldRedemptions(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return 0;

    // Clean up redemptions older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const result = await db.runAsync(
      'DELETE FROM redemption_workouts WHERE user_id = ? AND triggered_at < ?',
      [user.id, thirtyDaysAgo.toISOString()]
    );

    return result.changes || 0;
  }

  /**
   * Debug method to view all redemption records for user
   */
  static async debugRedemptionRecords(): Promise<RedemptionWorkout[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];

    const records = await db.getAllAsync<RedemptionWorkout>(
      'SELECT * FROM redemption_workouts WHERE user_id = ? ORDER BY triggered_at DESC',
      [user.id]
    );

    console.log('=== DEBUG: All Redemption Records ===');
    records.forEach((record, index) => {
      console.log(`${index + 1}. ID: ${record.id}, Status: ${record.status}, Triggered: ${record.triggered_at}, Deadline: ${record.deadline}`);
    });
    console.log('======================================');

    return records;
  }

  /**
   * Clean up phantom/test redemption records
   */
  static async cleanupPhantomRedemptions(): Promise<{
    cleaned: number;
    details: string[];
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return { cleaned: 0, details: [] };

    const details: string[] = [];
    let totalCleaned = 0;

    // First, debug what we have
    const allRecords = await this.debugRedemptionRecords();
    
    if (allRecords.length === 0) {
      details.push('No redemption records found');
      return { cleaned: 0, details };
    }

    // Clean up records that seem like test data or phantom records
    // 1. Remove any redemption records without a valid triggered_by_missed_date
    const invalidDateResult = await db.runAsync(
      'DELETE FROM redemption_workouts WHERE user_id = ? AND (triggered_by_missed_date IS NULL OR triggered_by_missed_date = "")',
      [user.id]
    );
    if (invalidDateResult.changes > 0) {
      totalCleaned += invalidDateResult.changes;
      details.push(`Removed ${invalidDateResult.changes} records with invalid dates`);
    }

    // 2. Remove any redemption records where the triggered date is in the future (use local time)
    const todayLocal = getTodayLocal();
    const futureResult = await db.runAsync(
      'DELETE FROM redemption_workouts WHERE user_id = ? AND triggered_by_missed_date > ?',
      [user.id, todayLocal]
    );
    if (futureResult.changes > 0) {
      totalCleaned += futureResult.changes;
      details.push(`Removed ${futureResult.changes} records with future dates`);
    }

    // 3. Remove duplicate redemption records for the same missed date
    const duplicateResult = await db.runAsync(`
      DELETE FROM redemption_workouts 
      WHERE user_id = ? AND id NOT IN (
        SELECT MIN(id) 
        FROM redemption_workouts 
        WHERE user_id = ? 
        GROUP BY triggered_by_missed_date
      )
    `, [user.id, user.id]);
    if (duplicateResult.changes > 0) {
      totalCleaned += duplicateResult.changes;
      details.push(`Removed ${duplicateResult.changes} duplicate records`);
    }

    // 4. If user reports no redemptions were actually done, we can safely remove all records
    // This is a more aggressive cleanup that should only be done manually
    
    console.log(`Phantom cleanup completed: ${totalCleaned} records removed`);
    details.forEach(detail => console.log(`- ${detail}`));

    return { cleaned: totalCleaned, details };
  }

  /**
   * Nuclear option: Remove ALL redemption records for user (use with caution)
   */
  static async clearAllRedemptionRecords(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return 0;

    console.log('WARNING: Clearing ALL redemption records for user');
    const result = await db.runAsync(
      'DELETE FROM redemption_workouts WHERE user_id = ?',
      [user.id]
    );

    const cleared = result.changes || 0;
    console.log(`Cleared ${cleared} redemption records`);
    return cleared;
  }
}