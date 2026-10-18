import type {
  HealthDailyMetrics,
  HealthSleepSession,
  HealthSleepStage,
} from '@/database/database';

export type HealthAvailability =
  | 'unsupported'
  | 'not_installed'
  | 'update_required'
  | 'needs_permission'
  | 'partial'
  | 'ready';

export const REQUIRED_PERMISSIONS: unknown[] = [];

/**
 * Web stub. Health Connect is Android-only, and importing the native module on
 * web breaks `expo export --platform web`. Shape matches the native service so
 * the screen needs no platform branching.
 */
export class HealthConnectService {
  static async getAvailability(): Promise<HealthAvailability> {
    return 'unsupported';
  }

  static async getGrantedRecordTypes(): Promise<Set<string>> {
    return new Set();
  }

  static async requestPermissions(): Promise<HealthAvailability> {
    return 'unsupported';
  }

  static async isPermissionDialogBlocked(): Promise<boolean> {
    return false;
  }

  static openSettings() {
    // No-op on web.
  }

  static async getLastSyncedAt(): Promise<string | null> {
    return null;
  }

  static async syncAll(_force = false): Promise<void> {
    // No-op on web.
  }

  static async getDailyMetrics(_days: number): Promise<HealthDailyMetrics[]> {
    return [];
  }

  static async getSleepSessionWithStages(
    _localDate: string
  ): Promise<{ session: HealthSleepSession; stages: HealthSleepStage[] } | null> {
    return null;
  }

  static async getLatestSleepSession(): Promise<
    { session: HealthSleepSession; stages: HealthSleepStage[] } | null
  > {
    return null;
  }

  static async getLifetimeDistanceKm(): Promise<number> {
    return 0;
  }

  static async getPreferredOrigin(): Promise<string | null> {
    return null;
  }

  static async isWeightSharingEnabled(): Promise<boolean> {
    return false;
  }

  static async enableWeightSharing(): Promise<boolean> {
    return false;
  }

  static async disableWeightSharing(): Promise<void> {
    // No-op on web.
  }

  static async writeWeight(_kg: number, _when?: Date): Promise<boolean> {
    return false;
  }

  static async getRecentExerciseSessions(_limit?: number): Promise<never[]> {
    return [];
  }
}

// HealthScoreService reads only from SQLite and has no native dependency, so it
// needs no web stub — it simply returns empty results when there are no rows.
