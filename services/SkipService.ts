import { database, Skip } from '@/database/database';
import { UserService } from './UserService';
import { getTodayLocal } from '@/utils/dateUtils';
import { ScheduledWorkoutService } from './ScheduledWorkoutService';

export class SkipService {
  static async hasSkippedToday(): Promise<boolean> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return false;

    const today = getTodayLocal();

    const skip = await db.getFirstAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? AND skip_date = ?',
      [user.id, today]
    );

    return skip !== null;
  }

  static async getTodaySkip(): Promise<Skip | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return null;

    const today = getTodayLocal();

    const skip = await db.getFirstAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? AND skip_date = ?',
      [user.id, today]
    );

    return skip || null;
  }

  static async createSkip(excuse: string, skipDate?: string): Promise<Skip> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    const targetDate = skipDate || getTodayLocal();

    // Check if already completed workout on that date
    const completedWorkout = await db.getFirstAsync(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
      [user.id, targetDate, 'completed']
    );

    if (completedWorkout) {
      throw new Error('You already completed your workout on this date! No excuses needed when you crushed it! 💪');
    }

    // Check if workout is currently in progress on that date
    const inProgressWorkout = await db.getFirstAsync(
      'SELECT * FROM workouts WHERE user_id = ? AND workout_date = ? AND status = ?',
      [user.id, targetDate, 'in_progress']
    );

    if (inProgressWorkout) {
      throw new Error('You cannot make an excuse while your workout is in progress! Finish what you started!');
    }

    // Check if already skipped on that date
    const existingSkip = await db.getFirstAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? AND skip_date = ?',
      [user.id, targetDate]
    );
    if (existingSkip) {
      throw new Error('You have already made an excuse for this date!');
    }

    // Read the planned time before the scheduled workout is cleared below, so
    // the Lab can tell which time slots get skipped.
    let scheduledTime: string | null = null;
    try {
      scheduledTime = (await ScheduledWorkoutService.getScheduledWorkout(targetDate))?.workout_time ?? null;
    } catch {
      scheduledTime = null;
    }

    const result = await db.runAsync(
      'INSERT INTO skips (user_id, excuse, skip_date, scheduled_time) VALUES (?, ?, ?, ?)',
      [user.id, excuse, targetDate, scheduledTime]
    );

    const skip = await db.getFirstAsync<Skip>(
      'SELECT * FROM skips WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!skip) throw new Error('Failed to create skip');

    // Clear the scheduled workout for the skip date
    try {
      const scheduledWorkout = await ScheduledWorkoutService.getScheduledWorkout(targetDate);
      if (scheduledWorkout) {
        await ScheduledWorkoutService.removeScheduledWorkout(targetDate);
        console.log('Scheduled workout cleared after making excuse:', targetDate);
      }
    } catch (error) {
      console.warn('Could not clear scheduled workout after making excuse:', error);
    }

    return skip;
  }

  static async getTotalSkips(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return 0;

    const result = await db.getFirstAsync<{count: number}>(
      'SELECT COUNT(*) as count FROM skips WHERE user_id = ?',
      [user.id]
    );

    return result?.count || 0;
  }

  static async getSkipsByExcuse(): Promise<{excuse: string, count: number}[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return [];

    const skips = await db.getAllAsync<{excuse: string, count: number}>(
      'SELECT excuse, COUNT(*) as count FROM skips WHERE user_id = ? GROUP BY excuse ORDER BY count DESC',
      [user.id]
    );

    return skips;
  }

  static async getAllSkips(): Promise<Skip[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return [];

    const skips = await db.getAllAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? ORDER BY created_at DESC',
      [user.id]
    );

    return skips;
  }

  /**
   * Get the number of consecutive days without making an excuse
   * Resets to 0 when an excuse is made, then starts counting again
   * If no excuse has ever been made, counts from user creation date
   */
  static async getDaysWithoutExcuse(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return 0;

    // Get the most recent excuse
    const lastExcuse = await db.getFirstAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? ORDER BY skip_date DESC LIMIT 1',
      [user.id]
    );

    // Count completed workouts since the last excuse (or all if no excuses)
    if (!lastExcuse) {
      const result = await db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND status = ? AND verified = 1',
        [user.id, 'completed']
      );
      return result?.count || 0;
    }

    const result = await db.getFirstAsync<{count: number}>(
      'SELECT COUNT(*) as count FROM workouts WHERE user_id = ? AND status = ? AND verified = 1 AND workout_date > ?',
      [user.id, 'completed', lastExcuse.skip_date]
    );

    return result?.count || 0;
  }
}