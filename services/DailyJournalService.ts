import { database, type DailyJournal } from '@/database/database';
import { UserService } from './UserService';
import { getTodayLocal } from '@/utils/dateUtils';

/**
 * Subjective daily context — what the sensors can't see.
 *
 * Health Connect records the body's response but not the input. Alcohol and
 * late meals both measurably raise overnight heart rate and suppress HRV, so
 * without knowing about them a low recovery score has no explanation attached.
 * Logging is entirely optional and partial entries are fine.
 */
export class DailyJournalService {
  /** Insert or update the entry for a date. Only supplied fields change. */
  static async upsert(
    fields: Partial<
      Pick<
        DailyJournal,
        | 'food_notes'
        | 'last_meal_time'
        | 'alcohol_units'
        | 'caffeine_servings'
        | 'stress_level'
        | 'notes'
      >
    >,
    localDate?: string
  ): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const date = localDate ?? getTodayLocal();
    const now = new Date().toISOString();

    await db.runAsync(
      `INSERT INTO daily_journal (user_id, local_date, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id, local_date) DO NOTHING`,
      [user.id, date, now]
    );

    // Update only the keys actually provided, so saving one field never wipes
    // another that was filled in earlier the same day.
    const sets: string[] = [];
    const params: (string | number | null)[] = [];
    for (const [key, value] of Object.entries(fields)) {
      sets.push(`${key} = ?`);
      params.push(value === undefined ? null : (value as string | number | null));
    }
    if (sets.length === 0) return;

    sets.push('updated_at = ?');
    params.push(now, user.id, date);

    await db.runAsync(
      `UPDATE daily_journal SET ${sets.join(', ')} WHERE user_id = ? AND local_date = ?`,
      params
    );
  }

  static async getForDate(localDate?: string): Promise<DailyJournal | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;
      return await db.getFirstAsync<DailyJournal>(
        'SELECT * FROM daily_journal WHERE user_id = ? AND local_date = ?',
        [user.id, localDate ?? getTodayLocal()]
      );
    } catch {
      return null;
    }
  }

  /** Recent entries, newest first, for the analysis prompt. */
  static async getRecent(days = 30): Promise<DailyJournal[]> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];
      return await db.getAllAsync<DailyJournal>(
        `SELECT * FROM daily_journal
         WHERE user_id = ?
         ORDER BY local_date DESC
         LIMIT ?`,
        [user.id, days]
      );
    } catch {
      return [];
    }
  }

  /**
   * How many days have a usable entry.
   *
   * Behaviour-correlation platforms require roughly 5 occurrences and 5
   * non-occurrences before reporting an effect. Surfacing the count lets the UI
   * and the prompt be honest about whether any pattern is yet meaningful.
   */
  static async getLoggedDayCount(): Promise<number> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return 0;
      const row = await db.getFirstAsync<{ count: number }>(
        `SELECT COUNT(*) as count FROM daily_journal
         WHERE user_id = ?
           AND (food_notes IS NOT NULL OR alcohol_units IS NOT NULL
                OR caffeine_servings IS NOT NULL OR stress_level IS NOT NULL
                OR notes IS NOT NULL)`,
        [user.id]
      );
      return row?.count ?? 0;
    } catch {
      return 0;
    }
  }
}
