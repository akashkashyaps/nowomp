import { database, Schedule } from '@/database/database';
import { UserService } from './UserService';

export class ScheduleService {
  /**
   * Schedule locking was removed: the `locked` column no longer exists in the
   * schemas table, so writing to it threw on every fresh install. Nothing in
   * the app used the feature.
   */
  static async saveSchedule(workoutDays: string[], workoutTime: string): Promise<Schedule> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    // Delete existing schedule for user
    await db.runAsync('DELETE FROM schedules WHERE user_id = ?', [user.id]);

    const result = await db.runAsync(
      'INSERT INTO schedules (user_id, workout_days, workout_time, updated_at) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
      [user.id, JSON.stringify(workoutDays), workoutTime]
    );

    const schedule = await db.getFirstAsync<Schedule>(
      'SELECT * FROM schedules WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!schedule) throw new Error('Failed to create schedule');
    return schedule;
  }

  static async getSchedule(): Promise<Schedule | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) return null;

    const schedule = await db.getFirstAsync<Schedule>(
      'SELECT * FROM schedules WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1',
      [user.id]
    );

    return schedule;
  }

  static async clearSchedule(): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    
    if (!user) throw new Error('No user found');

    await db.runAsync('DELETE FROM schedules WHERE user_id = ?', [user.id]);
  }

}