import { database, FreezeToken } from '@/database/database';
import { UserService } from './UserService';

export class FreezeTokenService {
  private static readonly STREAK_MILESTONE_INTERVAL = 15; // Every 15 days
  private static readonly MAX_TOKENS = 5;
  private static readonly TOKEN_EXPIRY_DAYS = 45;

  /**
   * Check if user has earned a freeze token based on their current streak
   * Called after each successful workout completion
   */
  static async checkAndAwardFreezeToken(streakCount: number): Promise<FreezeToken | null> {
    if (streakCount % this.STREAK_MILESTONE_INTERVAL !== 0) {
      return null; // No milestone reached
    }

    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    // Check if token already earned for this milestone in the CURRENT streak
    // Only block if the token is still available (not used, not expired).
    // Used/expired tokens from previous streaks should not prevent re-earning.
    const now = new Date().toISOString();
    const existingToken = await db.getFirstAsync<FreezeToken>(
      'SELECT * FROM freeze_tokens WHERE user_id = ? AND earned_on_streak_day = ? AND used_at IS NULL AND expires_at > ?',
      [user.id, streakCount, now]
    );

    if (existingToken) {
      console.log('Freeze token already earned and still available for streak day:', streakCount);
      return existingToken;
    }

    // Check current token count (excluding expired ones)
    const currentTokenCount = await this.getAvailableTokenCount();
    if (currentTokenCount >= this.MAX_TOKENS) {
      console.log('Maximum freeze tokens reached, cannot earn more');
      return null;
    }

    // Award new token
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + this.TOKEN_EXPIRY_DAYS);

    const result = await db.runAsync(
      'INSERT INTO freeze_tokens (user_id, earned_at, earned_on_streak_day, expires_at) VALUES (?, ?, ?, ?)',
      [user.id, now, streakCount, expiryDate.toISOString()]
    );

    const newToken = await db.getFirstAsync<FreezeToken>(
      'SELECT * FROM freeze_tokens WHERE id = ?',
      [result.lastInsertRowId]
    );

    if (!newToken) throw new Error('Failed to create freeze token');
    
    console.log(`Freeze token earned! Streak milestone: ${streakCount} days`);
    return newToken;
  }

  /**
   * Get count of available (non-expired, non-used) freeze tokens
   */
  static async getAvailableTokenCount(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return 0;

    const now = new Date().toISOString();
    const result = await db.getFirstAsync<{count: number}>(
      'SELECT COUNT(*) as count FROM freeze_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ?',
      [user.id, now]
    );

    return result?.count || 0;
  }

  /**
   * Get all available freeze tokens for the user
   */
  static async getAvailableTokens(): Promise<FreezeToken[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];

    const now = new Date().toISOString();
    const tokens = await db.getAllAsync<FreezeToken>(
      'SELECT * FROM freeze_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ? ORDER BY earned_at ASC',
      [user.id, now]
    );

    return tokens;
  }

  /**
   * Use a freeze token for an excuse
   */
  static async consumeToken(excuseId: number): Promise<FreezeToken | null> {
    const availableTokens = await this.getAvailableTokens();
    if (availableTokens.length === 0) {
      return null; // No tokens available
    }

    // Use the oldest token first (FIFO)
    const tokenToUse = availableTokens[0];
    const db = await database.getDatabase();
    const now = new Date().toISOString();

    await db.runAsync(
      'UPDATE freeze_tokens SET used_at = ?, excuse_id = ? WHERE id = ?',
      [now, excuseId, tokenToUse.id]
    );

    const updatedToken = await db.getFirstAsync<FreezeToken>(
      'SELECT * FROM freeze_tokens WHERE id = ?',
      [tokenToUse.id]
    );

    return updatedToken || null;
  }

  /**
   * Get progress towards next freeze token
   */
  static async getProgressToNextToken(currentStreak: number): Promise<{
    currentStreak: number;
    nextMilestone: number;
    daysToNext: number;
    progressText: string;
  }> {
    const nextMilestone = Math.ceil(currentStreak / this.STREAK_MILESTONE_INTERVAL) * this.STREAK_MILESTONE_INTERVAL;
    const daysToNext = nextMilestone - currentStreak;

    // If exactly at milestone, show next one
    const actualNextMilestone = daysToNext === 0 ? nextMilestone + this.STREAK_MILESTONE_INTERVAL : nextMilestone;
    const actualDaysToNext = daysToNext === 0 ? this.STREAK_MILESTONE_INTERVAL : daysToNext;

    return {
      currentStreak,
      nextMilestone: actualNextMilestone,
      daysToNext: actualDaysToNext,
      progressText: `${currentStreak}/${actualNextMilestone} days to next freeze`
    };
  }

  /**
   * Get all freeze token statistics for user
   */
  static async getTokenStats(): Promise<{
    availableTokens: number;
    totalEarned: number;
    totalUsed: number;
    totalExpired: number;
  }> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return { availableTokens: 0, totalEarned: 0, totalUsed: 0, totalExpired: 0 };

    const now = new Date().toISOString();

    const [available, earned, used, expired] = await Promise.all([
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM freeze_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at > ?',
        [user.id, now]
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM freeze_tokens WHERE user_id = ?',
        [user.id]
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM freeze_tokens WHERE user_id = ? AND used_at IS NOT NULL',
        [user.id]
      ),
      db.getFirstAsync<{count: number}>(
        'SELECT COUNT(*) as count FROM freeze_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at <= ?',
        [user.id, now]
      ),
    ]);

    return {
      availableTokens: available?.count || 0,
      totalEarned: earned?.count || 0,
      totalUsed: used?.count || 0,
      totalExpired: expired?.count || 0,
    };
  }

  /**
   * Get freeze token usage history
   */
  static async getTokenHistory(): Promise<{
    token: FreezeToken;
    excuse?: any;
    status: 'available' | 'used' | 'expired';
  }[]> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return [];

    const tokens = await db.getAllAsync<FreezeToken>(
      'SELECT * FROM freeze_tokens WHERE user_id = ? ORDER BY earned_at DESC',
      [user.id]
    );

    const now = new Date().toISOString();
    const history = [];

    for (const token of tokens) {
      let status: 'available' | 'used' | 'expired';
      let excuse = null;

      if (token.used_at) {
        status = 'used';
        if (token.excuse_id) {
          excuse = await db.getFirstAsync(
            'SELECT * FROM excuse_submissions WHERE id = ?',
            [token.excuse_id]
          );
        }
      } else if (token.expires_at <= now) {
        status = 'expired';
      } else {
        status = 'available';
      }

      history.push({
        token,
        excuse,
        status,
      });
    }

    return history;
  }

  /**
   * Clean up expired tokens (maintenance function)
   * Only removes very old expired tokens (>90 days past expiry) to prevent DB bloat.
   * Recent expired tokens are kept so totalEarned/totalExpired stats remain accurate.
   */
  static async cleanupExpiredTokens(): Promise<number> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return 0;

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 90);
    const result = await db.runAsync(
      'DELETE FROM freeze_tokens WHERE user_id = ? AND used_at IS NULL AND expires_at <= ?',
      [user.id, cutoff.toISOString()]
    );

    return result.changes || 0;
  }
}