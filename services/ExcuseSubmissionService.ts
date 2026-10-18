import { database, ExcuseSubmission } from '@/database/database';
import { UserService } from './UserService';
import { FreezeTokenService } from './FreezeTokenService';
import { RedemptionWorkoutService } from './RedemptionWorkoutService';
import { ScheduledWorkoutService } from './ScheduledWorkoutService';
import { getTodayLocal } from '@/utils/dateUtils';
import { SkipService } from './SkipService';

/** The stored excuse type, derived from the excuse itself (it used to always be 'other'). */
export const excuseTypeFor = (label: string): 'medical' | 'emergency' | 'other' =>
  label === 'Sick / Injured' ? 'medical' : label === 'Genuine Emergency' ? 'emergency' : 'other';

/**
 * Shown when an excuse is attempted during an active redemption. Excuses are
 * blocked then: redemption is the last chance, and an excuse can't cancel it.
 * The missed-workout lock screen is the exception (it can't be refused).
 */
export const REDEMPTION_BLOCKS_EXCUSES = {
  title: '🔄 NO EXCUSES IN REDEMPTION',
  message: "You're in redemption. Excuses are off until it's done. Finish your redemption workout to save your streak.",
};

export interface ExcuseOutcome {
  freezeUsed: boolean;
  redemptionTriggered: boolean;
}

/**
 * An excuse lives in two tables with different jobs:
 * - `skips` is the excuse itself (what, when, the planned time). The Lab,
 *   recap, widget and stats read it.
 * - `excuse_submissions` is its consequence (freeze token used, redemption
 *   started). Streak and redemption logic read it.
 * `recordExcuse` is the single way to make an excuse, so both stay in step.
 */
export class ExcuseSubmissionService {
  /**
   * Record an excuse and apply its consequence. The excuse itself always
   * lands (or this throws, e.g. a second excuse for the same day). The
   * consequence can be refused — e.g. redemption is already active this week —
   * in which case the excuse stands without one, exactly as before this was
   * unified; refusing the excuse too would trap the user on the missed-workout
   * lock screen, which requires an excuse to continue.
   */
  static async recordExcuse(excuseText: string, forDate?: string): Promise<ExcuseOutcome> {
    await SkipService.createSkip(excuseText, forDate);
    try {
      const { freezeUsed, redemptionTriggered } = await this.submitExcuse(
        excuseText,
        excuseTypeFor(excuseText),
        forDate
      );
      return { freezeUsed, redemptionTriggered };
    } catch (error) {
      console.warn('Excuse recorded without a consequence:', (error as Error).message);
      return { freezeUsed: false, redemptionTriggered: false };
    }
  }

  /**
   * Submit an excuse for a missed workout
   */
  static async submitExcuse(
    excuseText: string,
    excuseType: 'medical' | 'emergency' | 'other',
    submittedForDate?: string
  ): Promise<{
    excuse: ExcuseSubmission;
    freezeUsed: boolean;
    redemptionTriggered: boolean;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const today = getTodayLocal();
    const targetDate = submittedForDate || today;
    const now = new Date().toISOString();

    // Validate submission timing
    await this.validateExcuseSubmission(targetDate);

    // Check if freeze token is available
    const availableTokens = await FreezeTokenService.getAvailableTokenCount();
    const freezeTokenAvailable = availableTokens > 0;

    // Create excuse submission with freeze_token_used = false initially
    // We only set it to true AFTER the token is actually consumed
    const result = await db.runAsync(
      `INSERT INTO excuse_submissions
       (user_id, excuse_text, excuse_type, submitted_for_date, submitted_at, freeze_token_used, redemption_triggered)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        excuseText,
        excuseType,
        targetDate,
        now,
        false,
        false
      ]
    );

    const excuse = await db.getFirstAsync<ExcuseSubmission>(
      'SELECT * FROM excuse_submissions WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!excuse) throw new Error('Failed to create excuse submission');

    let freezeUsed = false;
    let redemptionTriggered = false;

    if (freezeTokenAvailable) {
      // Use freeze token
      const usedToken = await FreezeTokenService.consumeToken(excuse.id);
      if (usedToken) {
        // Only mark freeze_token_used = true after successful consumption
        await db.runAsync(
          'UPDATE excuse_submissions SET freeze_token_used = 1, freeze_token_id = ? WHERE id = ?',
          [usedToken.id, excuse.id]
        );
        freezeUsed = true;
        console.log('Freeze token used for excuse:', excuse.id);
      }
    } else {
      // No freeze token available - create redemption workout immediately
      try {
        const redemptionWorkout = await RedemptionWorkoutService.createRedemptionWorkout(
          targetDate,
          excuse.id
        );
        if (redemptionWorkout) {
          // Update the excuse to mark redemption as triggered
          await db.runAsync(
            'UPDATE excuse_submissions SET redemption_triggered = ? WHERE id = ?',
            [true, excuse.id]
          );
          redemptionTriggered = true;
          console.log('Redemption workout created immediately for excuse:', excuse.id);
        }
      } catch (error: any) {
        console.error('Failed to create redemption workout:', error);
        // Re-throw the error with a user-friendly message
        throw new Error(error.message || 'Failed to create redemption workout');
      }
    }

    // Clear the scheduled workout for the excuse date since an excuse has been made
    try {
      const scheduledWorkout = await ScheduledWorkoutService.getScheduledWorkout(targetDate);
      if (scheduledWorkout) {
        await ScheduledWorkoutService.removeScheduledWorkout(targetDate);
        console.log('Scheduled workout cleared after excuse submission:', targetDate);
      }
    } catch (error) {
      console.warn('Could not clear scheduled workout after excuse submission:', error);
      // Don't fail the excuse submission if scheduled workout clearing fails
    }

    return {
      excuse,
      freezeUsed,
      redemptionTriggered,
    };
  }

  /**
   * Validate if excuse submission is allowed
   */
  private static async validateExcuseSubmission(targetDate: string): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const today = getTodayLocal();
    const targetDateTime = new Date(targetDate);
    const todayDateTime = new Date(today);
    const timeDiff = todayDateTime.getTime() - targetDateTime.getTime();
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

    // Check submission deadline (within 24 hours)
    if (daysDiff > 1) {
      throw new Error('Excuse submission deadline has passed. You can only submit excuses within 24 hours of the missed workout.');
    }

    // Check if already submitted excuse for this date
    const existingExcuse = await db.getFirstAsync<ExcuseSubmission>(
      'SELECT * FROM excuse_submissions WHERE user_id = ? AND submitted_for_date = ?',
      [user.id, targetDate]
    );

    if (existingExcuse) {
      throw new Error('You have already submitted an excuse for this date.');
    }

    // Check if workout was already completed for this date
    const completedWorkout = await db.getFirstAsync(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
      [user.id, targetDate, 'completed']
    );

    if (completedWorkout) {
      throw new Error('You cannot submit an excuse for a date when you already completed a workout.');
    }

    // Check if workout is currently in progress for this date
    const inProgressWorkout = await db.getFirstAsync(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
      [user.id, targetDate, 'in_progress']
    );

    if (inProgressWorkout) {
      throw new Error('You cannot make an excuse while your workout is in progress! Finish what you started!');
    }

    // Check if there's an active redemption workout (only one per 7-day period)
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    
    const activeRedemption = await db.getFirstAsync(
      'SELECT * FROM redemption_workouts WHERE user_id = ? AND status = ? AND triggered_at > ?',
      [user.id, 'active', oneWeekAgo.toISOString()]
    );

    if (activeRedemption) {
      throw new Error('You already have an active redemption workout. You can only enter redemption mode once per week.');
    }
  }

  /**
   * Get today's excuse if any
   */
  static async getTodaysExcuse(): Promise<ExcuseSubmission | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return null;

    const today = getTodayLocal();
    const excuse = await db.getFirstAsync<ExcuseSubmission>(
      'SELECT * FROM excuse_submissions WHERE user_id = ? AND submitted_for_date = ?',
      [user.id, today]
    );

    return excuse || null;
  }

  /**
   * Get all excuses for user
   */
  static async getAllExcuses(): Promise<ExcuseSubmission[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];

    const excuses = await db.getAllAsync<ExcuseSubmission>(
      'SELECT * FROM excuse_submissions WHERE user_id = ? ORDER BY submitted_at DESC',
      [user.id]
    );

    return excuses;
  }

  /**
   * Get excuse statistics
   */
  static async getExcuseStats(): Promise<{
    totalExcuses: number;
    excusesWithFreeze: number;
    excusesWithRedemption: number;
    excusesByType: { type: string; count: number }[];
    thisMonthExcuses: number;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return {
      totalExcuses: 0,
      excusesWithFreeze: 0,
      excusesWithRedemption: 0,
      excusesByType: [],
      thisMonthExcuses: 0,
    };

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    thisMonthStart.setHours(0, 0, 0, 0);

    const [total, withFreeze, withRedemption, byType, thisMonth] = await Promise.all([
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM excuse_submissions WHERE user_id = ?',
        [user.id]
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM excuse_submissions WHERE user_id = ? AND freeze_token_used = ?',
        [user.id, true]
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM excuse_submissions WHERE user_id = ? AND redemption_triggered = ?',
        [user.id, true]
      ),
      db.getAllAsync<{type: string; count: number}>(
        'SELECT excuse_type as type, COUNT(*) as count FROM excuse_submissions WHERE user_id = ? GROUP BY excuse_type',
        [user.id]
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM excuse_submissions WHERE user_id = ? AND submitted_at >= ?',
        [user.id, thisMonthStart.toISOString()]
      ),
    ]);

    return {
      totalExcuses: total?.count || 0,
      excusesWithFreeze: withFreeze?.count || 0,
      excusesWithRedemption: withRedemption?.count || 0,
      excusesByType: byType || [],
      thisMonthExcuses: thisMonth?.count || 0,
    };
  }

  /**
   * Check if excuse can be submitted for a given date
   */
  static async canSubmitExcuseForDate(targetDate: string): Promise<{
    canSubmit: boolean;
    reason?: string;
  }> {
    try {
      await this.validateExcuseSubmission(targetDate);
      return { canSubmit: true };
    } catch (error) {
      return {
        canSubmit: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get days since last excuse was made
   */
  static async getDaysSinceLastExcuse(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return 0;

    const lastExcuse = await db.getFirstAsync<ExcuseSubmission>(
      'SELECT * FROM excuse_submissions WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 1',
      [user.id]
    );

    if (!lastExcuse) return 0; // No excuses made yet

    const lastExcuseDate = new Date(lastExcuse.submitted_at);
    const today = new Date();
    const diffTime = today.getTime() - lastExcuseDate.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }
}