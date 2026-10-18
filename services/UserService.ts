import { database, User } from '@/database/database';

export class UserService {
  static async createUser(displayName: string): Promise<User> {
    const db = await database.getDatabase();
    
    const result = await db.runAsync(
      'INSERT INTO users (display_name) VALUES (?)',
      [displayName]
    );

    const user = await db.getFirstAsync<User>(
      'SELECT * FROM users WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!user) throw new Error('Failed to create user');
    return user;
  }

  static async getCurrentUser(): Promise<User | null> {
    const db = await database.getDatabase();
    
    const user = await db.getFirstAsync<User>(
      'SELECT * FROM users ORDER BY created_at DESC LIMIT 1'
    );

    return user;
  }

  static async updateUser(id: number, displayName: string): Promise<void> {
    const db = await database.getDatabase();

    await db.runAsync(
      'UPDATE users SET display_name = ? WHERE id = ?',
      [displayName, id]
    );
  }

  static async incrementScheduleChanges(): Promise<void> {
    const db = await database.getDatabase();
    const user = await this.getCurrentUser();

    if (!user) throw new Error('No user found');

    // Increment the counter
    await db.runAsync(
      'UPDATE users SET schedule_changes = schedule_changes + 1 WHERE id = ?',
      [user.id]
    );

    // Log the schedule change with timestamp
    const now = new Date().toISOString();
    await db.runAsync(
      'INSERT INTO schedule_change_logs (user_id, changed_at) VALUES (?, ?)',
      [user.id, now]
    );
  }

  static async getScheduleChanges(): Promise<number> {
    const user = await this.getCurrentUser();

    if (!user) return 0;

    return user.schedule_changes || 0;
  }

  static async getScheduleChangesComparison(): Promise<{ thisWeek: number; lastWeek: number }> {
    const db = await database.getDatabase();
    const user = await this.getCurrentUser();

    if (!user) return { thisWeek: 0, lastWeek: 0 };

    const now = new Date();

    // Get the start of this week (Sunday)
    const thisWeekStart = new Date(now);
    thisWeekStart.setHours(0, 0, 0, 0);
    thisWeekStart.setDate(now.getDate() - now.getDay());

    // Get the start of last week
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setDate(thisWeekStart.getDate() - 7);

    // Get the end of last week (Saturday)
    const lastWeekEnd = new Date(thisWeekStart);
    lastWeekEnd.setMilliseconds(-1);

    // Count changes this week
    const thisWeekResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM schedule_change_logs WHERE user_id = ? AND changed_at >= ?',
      [user.id, thisWeekStart.toISOString()]
    );

    // Count changes last week
    const lastWeekResult = await db.getFirstAsync<{ count: number }>(
      'SELECT COUNT(*) as count FROM schedule_change_logs WHERE user_id = ? AND changed_at >= ? AND changed_at < ?',
      [user.id, lastWeekStart.toISOString(), lastWeekEnd.toISOString()]
    );

    return {
      thisWeek: thisWeekResult?.count || 0,
      lastWeek: lastWeekResult?.count || 0,
    };
  }

  static async updateHighestStreak(currentStreak: number): Promise<void> {
    const db = await database.getDatabase();
    const user = await this.getCurrentUser();

    if (!user) throw new Error('No user found');

    // Only update if current streak is higher than stored highest streak
    if (currentStreak > (user.highest_streak || 0)) {
      await db.runAsync(
        'UPDATE users SET highest_streak = ? WHERE id = ?',
        [currentStreak, user.id]
      );
    }
  }

  static async getHighestStreak(): Promise<number> {
    const user = await this.getCurrentUser();

    if (!user) return 0;

    return user.highest_streak || 0;
  }
}