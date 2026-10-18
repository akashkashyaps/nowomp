import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Everything lives only on this phone and backups are manual, so the app
 * gently reminds you to export once a month. Nothing leaves the device unless
 * you choose where the export goes.
 */

const KEY = '@last_backup_at';
const REMIND_AFTER_DAYS = 30;

export class BackupReminderService {
  static async markBackedUp(): Promise<void> {
    try {
      await AsyncStorage.setItem(KEY, new Date().toISOString());
    } catch {}
  }

  /** Days since the last export, or null if there has never been one. */
  static async daysSinceBackup(): Promise<number | null> {
    try {
      const at = await AsyncStorage.getItem(KEY);
      return at ? Math.floor((Date.now() - new Date(at).getTime()) / 86400000) : null;
    } catch {
      return null;
    }
  }

  /**
   * Due when the last export is over a month old, or when there has never been
   * one and the account is old enough to have something worth keeping.
   */
  static async isDue(accountCreatedAt?: string): Promise<boolean> {
    const days = await this.daysSinceBackup();
    if (days != null) return days >= REMIND_AFTER_DAYS;
    if (!accountCreatedAt) return false;
    const age = (Date.now() - new Date(accountCreatedAt.replace(' ', 'T') + 'Z').getTime()) / 86400000;
    return age >= 14;
  }
}
