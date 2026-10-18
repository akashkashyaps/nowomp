import AsyncStorage from '@react-native-async-storage/async-storage';
import { getTodayLocal } from '@/utils/dateUtils';
import { database } from '@/database/database';
import { UserService } from './UserService';
import { StreakManagementService } from './StreakManagementService';

const LAST_MAINTENANCE_DATE_KEY = '@last_maintenance_date';

export class DailyMaintenanceService {
  /**
   * Check if maintenance needs to run and execute it
   * Call this on app startup (every time app comes to foreground)
   */
  static async checkAndRunMaintenance(): Promise<void> {
    try {
      // Always check for expired redemptions on every app open — a redemption
      // can expire at any time during the day, not just at day boundaries
      await StreakManagementService.processFailedRedemptions();

      const today = getTodayLocal();
      const lastMaintenanceDate = await AsyncStorage.getItem(LAST_MAINTENANCE_DATE_KEY);

      // Run daily-only tasks once per day
      if (lastMaintenanceDate !== today) {
        console.log('🔧 Running daily maintenance for:', today);
        await this.performDailyMaintenance();
        await AsyncStorage.setItem(LAST_MAINTENANCE_DATE_KEY, today);
        console.log('✅ Daily maintenance completed');
      } else {
        console.log('✓ Daily maintenance already run today:', today);
      }
    } catch (error) {
      console.error('Error in checkAndRunMaintenance:', error);
    }
  }

  /**
   * Daily-only maintenance tasks (run once per day)
   */
  private static async performDailyMaintenance(): Promise<void> {
    try {
      await StreakManagementService.cleanupExpiredTokens();
    } catch (error) {
      console.error('Error cleaning up expired tokens:', error);
    }
  }

  /**
   * Manual trigger for testing purposes
   */
  static async forceRunMaintenance(): Promise<void> {
    console.log('🔧 FORCE RUNNING MAINTENANCE');
    await this.performDailyMaintenance();
  }

  /**
   * Reset the last maintenance date (for testing)
   */
  static async resetMaintenanceDate(): Promise<void> {
    await AsyncStorage.removeItem(LAST_MAINTENANCE_DATE_KEY);
    console.log('Maintenance date reset');
  }

  /**
   * Check if there are any missed workouts that need an excuse
   * Returns the OLDEST missed workout date that needs attention
   * Looks back up to 30 days so missed workouts are caught even if the app isn't opened for a while
   */
  static async getPendingExcuseDate(): Promise<string | null> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) return null;

    const today = getTodayLocal();

    // Find the oldest scheduled workout in the past that has no completion, no excuse, and no skip
    const missedWorkout = await db.getFirstAsync<any>(
      `SELECT sw.workout_date FROM scheduled_workouts sw
       WHERE sw.user_id = ?
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
       ORDER BY sw.workout_date ASC
       LIMIT 1`,
      [user.id, today]
    );

    return missedWorkout?.workout_date || null;
  }
}
