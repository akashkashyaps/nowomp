import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getSdkStatus,
  initialize,
  requestPermission,
  getGrantedPermissions,
  openHealthConnectSettings,
  readRecords,
  insertRecords,
  aggregateRecord,
  aggregateGroupByPeriod,
  SdkAvailabilityStatus,
  SleepStageType,
  type Permission,
} from 'react-native-health-connect';
import { database, type HealthDailyMetrics, type HealthSleepSession, type HealthSleepStage, type SleepStageName } from '@/database/database';
import { UserService } from './UserService';
import { HealthProfileService } from './HealthProfileService';
import { getLocalDateString } from '@/utils/dateUtils';

/**
 * Availability of the Health Connect data store, as a single explicit state.
 *
 * These are genuinely distinct failure modes with distinct fixes, so the screen
 * switches on this rather than on a pair of booleans.
 */
export type HealthAvailability =
  | 'unsupported' // not Android
  | 'not_installed' // Health Connect app missing (API < 34)
  | 'update_required' // provider too old
  | 'needs_permission' // available, nothing granted
  | 'partial' // available, some granted
  | 'ready'; // all granted

/** Health Connect only serves records from the last 30 days without the history permission. */
const HISTORY_WINDOW_DAYS = 30;

/**
 * Bump this when a sync bug is fixed that left bad or missing cached data.
 * On the next sync the incremental window is ignored and the full 30 days are
 * re-read, repairing history that the old code got wrong.
 *
 * v2: the Steps aggregate key was wrong (STEPS_COUNT_TOTAL, actually
 *     COUNT_TOTAL) so step history was never written, and daily aggregate
 *     windows ran to 23:59 which made Health Connect project basal calories
 *     for the remainder of the day.
 * v3: HRV readings outside an overnight window were discarded, so devices that
 *     write one daily summary at an arbitrary hour recorded no HRV at all; and
 *     placeholder zero heart rates were stored, dragging averages to 0.
 * v4: Distance was never collected, so the Journeys ladder needs a one-time
 *     backfill rather than starting from the day the feature shipped.
 * v5: resting heart rate was only derived from overnight samples, so anyone who
 *     doesn't wear a tracker to bed got no value at all; it now falls back to
 *     the quietest part of the day.
 * v6: earlier HRV and resting-HR fixes only applied to days re-read after the
 *     fix. Because the incremental window is "last sync minus a day", history
 *     from before each fix kept its gaps, leaving week-over-week comparisons
 *     with nothing to compare against.
 * v7: every daily value was filed one day late. local_date was derived from the
 *     record's endTime, but a daily aggregate bucket for Aug 8 ends at midnight
 *     on Aug 9 — so each day's steps, distance and calories were attributed to
 *     the following day. Also adds the data-source filter, so cached totals
 *     computed across every app are no longer valid.
 * v8: the rollup used COALESCE, so a stored value was never replaced by a
 *     corrected one — only days inside the narrow incremental window were ever
 *     right. The window is now a week and the rollup overwrites.
 * v9: exercise sessions were read for zone minutes and then discarded, so the
 *     workout list has no history until they are re-read.
 * v10: exercise sessions now also store the heart-rate trace, max HR, calories
 *      and distance, none of which existed on previously stored rows.
 * v11: all-day heart-rate traces are stored per day for the daily chart.
 * v12: readRecords was never paginated, so only the first page of heart rate
 *      ever arrived — most days had no samples at all. Exercise sessions are
 *      also purged now so they re-read with their newer columns filled in.
 * v13: three separate holes, all of which stored NULL and looked like missing
 *      data rather than an error. The daily heart-rate read was still
 *      unpaginated and ascending, so it returned the oldest days and today's
 *      chart never had samples; per-session calories and distance used a
 *      day-sliced aggregate over a window shorter than a day, which returns no
 *      buckets at all; and zone minutes were only ever rolled into the daily
 *      total, never written to the session row the workout list reads. Session
 *      steps are new in this version.
 */
const SYNC_SCHEMA_VERSION = 13;
const SYNC_VERSION_KEY = '@health_sync_schema_version';

/** Skip a re-read if we synced this recently (ms). Nine AIDL round-trips per focus is slow. */
const SYNC_DEBOUNCE_MS = 15 * 60 * 1000;

export const REQUIRED_PERMISSIONS: Permission[] = [
  { accessType: 'read', recordType: 'HeartRateVariabilityRmssd' },
  { accessType: 'read', recordType: 'RestingHeartRate' },
  { accessType: 'read', recordType: 'HeartRate' },
  { accessType: 'read', recordType: 'SleepSession' },
  { accessType: 'read', recordType: 'Steps' },
  { accessType: 'read', recordType: 'Distance' },
  { accessType: 'read', recordType: 'TotalCaloriesBurned' },
  { accessType: 'read', recordType: 'ActiveCaloriesBurned' },
  { accessType: 'read', recordType: 'Weight' },
  { accessType: 'read', recordType: 'ExerciseSession' },
];

/**
 * Write access, requested separately and only when the user opts in.
 *
 * Kept out of REQUIRED_PERMISSIONS deliberately: everything else the app does is
 * read-only, and prompting every user for write access to a feature most will
 * never enable would be a poor trade. Weight is the only thing NoWomp can write,
 * and only weight the user typed into this app — never synced data.
 */
export const WEIGHT_WRITE_PERMISSION: Permission[] = [
  { accessType: 'write', recordType: 'Weight' },
];

/** Set when the user has opted in to sharing logged weight with Health Connect. */
const SHARE_WEIGHT_KEY = '@share_weight_to_health_connect';

/** Maps Health Connect's numeric stage constants onto our stage names. */
const STAGE_NAMES: Record<number, SleepStageName> = {
  [SleepStageType.AWAKE]: 'awake',
  [SleepStageType.SLEEPING]: 'light', // generic "asleep" with no finer detail
  [SleepStageType.OUT_OF_BED]: 'out_of_bed',
  [SleepStageType.LIGHT]: 'light',
  [SleepStageType.DEEP]: 'deep',
  [SleepStageType.REM]: 'rem',
  [SleepStageType.UNKNOWN]: 'unknown',
};

/**
 * Health Connect's numeric exercise types, mapped to readable names.
 *
 * Only the common ones are listed; anything else falls back to "Workout"
 * rather than showing a bare number.
 */
const EXERCISE_NAMES: Record<number, string> = {
  56: 'Running', 57: 'Treadmill Run', 79: 'Walking', 37: 'Hiking',
  8: 'Cycling', 9: 'Indoor Cycling', 73: 'Swimming', 74: 'Pool Swim',
  70: 'Strength Training', 81: 'Weightlifting', 13: 'Calisthenics',
  83: 'Yoga', 48: 'Pilates', 71: 'Stretching', 36: 'HIIT',
  25: 'Elliptical', 53: 'Rowing', 54: 'Rowing Machine',
  68: 'Stair Climbing', 69: 'Stair Machine', 16: 'Dancing',
  5: 'Basketball', 64: 'Football', 76: 'Tennis', 2: 'Badminton',
  11: 'Boxing', 44: 'Martial Arts', 26: 'Exercise Class',
  10: 'Boot Camp', 41: 'Jump Rope', 0: 'Workout',
};

const exerciseName = (type: number): string => EXERCISE_NAMES[type] ?? 'Workout';

const minutesBetween = (start: string, end: string) =>
  Math.max(0, (new Date(end).getTime() - new Date(start).getTime()) / 60000);

const median = (values: number[]): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
};

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.floor((p / 100) * sorted.length)));
  return sorted[idx];
};

export class HealthConnectService {
  private static initialized = false;
  /**
   * The sync currently in flight, if any.
   *
   * App launch, foregrounding and tab focus can all trigger a sync at once.
   * Without this they would run concurrently over the same tables and multiply
   * the work; callers now share a single run.
   */
  private static syncInFlight: Promise<void> | null = null;

  /**
   * Health Connect throws if you call anything before initialize(). Cache the
   * result so repeated focus events don't re-initialize.
   */
  private static async ensureInitialized(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    if (this.initialized) return true;
    try {
      this.initialized = await initialize();
      return this.initialized;
    } catch {
      return false;
    }
  }

  static async getAvailability(): Promise<HealthAvailability> {
    if (Platform.OS !== 'android') return 'unsupported';

    let status: number;
    try {
      status = await getSdkStatus();
    } catch {
      return 'not_installed';
    }

    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE) return 'not_installed';
    if (status === SdkAvailabilityStatus.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED) {
      return 'update_required';
    }

    if (!(await this.ensureInitialized())) return 'not_installed';

    return this.deriveFromGranted(await this.safeGetGranted());
  }

  private static async safeGetGranted(): Promise<Permission[]> {
    try {
      return (await getGrantedPermissions()) as Permission[];
    } catch {
      return [];
    }
  }

  private static deriveFromGranted(granted: Permission[]): HealthAvailability {
    const count = REQUIRED_PERMISSIONS.filter((req) =>
      granted.some(
        (g) => g.recordType === req.recordType && g.accessType === req.accessType
      )
    ).length;

    if (count === 0) return 'needs_permission';
    if (count < REQUIRED_PERMISSIONS.length) return 'partial';
    return 'ready';
  }

  /** Which of our required record types the user has actually granted. */
  static async getGrantedRecordTypes(): Promise<Set<string>> {
    if (!(await this.ensureInitialized())) return new Set();
    const granted = await this.safeGetGranted();
    return new Set(granted.filter((g) => g.accessType === 'read').map((g) => g.recordType));
  }

  /**
   * Request the permission set.
   *
   * Health Connect resolves with the granted subset and never rejects on denial.
   * After two denials Android silently stops showing the dialog, so we track the
   * attempt count and the caller flips to "open settings" when a request comes
   * back empty despite prior attempts.
   */
  static async requestPermissions(): Promise<HealthAvailability> {
    if (!(await this.ensureInitialized())) return 'not_installed';

    await this.bumpPermissionRequestCount();

    try {
      const granted = (await requestPermission(REQUIRED_PERMISSIONS)) as Permission[];
      return this.deriveFromGranted(granted);
    } catch {
      return 'needs_permission';
    }
  }

  /** True when the dialog is likely suppressed and the user must use system settings. */
  static async isPermissionDialogBlocked(): Promise<boolean> {
    const state = await this.getSyncState();
    return (state?.permission_request_count ?? 0) >= 2;
  }

  static openSettings() {
    try {
      openHealthConnectSettings();
    } catch {
      // No-op — nothing useful to do if the settings intent is unavailable.
    }
  }

  // ---------------------------------------------------------------- sync state

  private static async getSyncState() {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return null;
    return db.getFirstAsync<{
      permission_request_count: number;
      last_synced_at: string | null;
      last_successful_sync_at: string | null;
      preferred_origin: string | null;
    }>('SELECT * FROM health_sync_state WHERE user_id = ?', [user.id]);
  }

  private static async bumpPermissionRequestCount() {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return;
    await db.runAsync(
      `INSERT INTO health_sync_state (user_id, permission_request_count)
       VALUES (?, 1)
       ON CONFLICT(user_id) DO UPDATE SET
         permission_request_count = permission_request_count + 1`,
      [user.id]
    );
  }

  private static async markSynced(success: boolean) {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) return;
    const now = new Date().toISOString();
    await db.runAsync(
      `INSERT INTO health_sync_state (user_id, last_synced_at, last_successful_sync_at)
       VALUES (?, ?, ?)
       ON CONFLICT(user_id) DO UPDATE SET
         last_synced_at = excluded.last_synced_at,
         last_successful_sync_at = COALESCE(excluded.last_successful_sync_at, health_sync_state.last_successful_sync_at)`,
      [user.id, now, success ? now : null]
    );
  }

  static async getLastSyncedAt(): Promise<string | null> {
    const state = await this.getSyncState();
    return state?.last_successful_sync_at ?? null;
  }

  // ------------------------------------------------------------ data sources

  /**
   * The app package to read from, or null for "all apps".
   *
   * Currently always null. Health Connect de-duplicates overlapping records
   * across apps itself, so reading from everything gives the fullest picture —
   * the earlier mismatch with the source app turned out to be a date-attribution
   * bug, not double counting. The filter plumbing stays in place in case a
   * future device genuinely needs restricting to one source.
   */
  static async getPreferredOrigin(): Promise<string | null> {
    return null;
  }

  /** Health Connect wants an array; undefined means "every source". */
  private static originFilter(origin: string | null): string[] | undefined {
    return origin ? [origin] : undefined;
  }

  // ----------------------------------------------------- writing weight back

  /**
   * Whether the user has opted in to sharing logged weight with Health Connect.
   *
   * Off unless explicitly enabled. Everything else this app does is read-only,
   * so this is the single exception and it stays the user's choice.
   */
  static async isWeightSharingEnabled(): Promise<boolean> {
    try {
      return (await AsyncStorage.getItem(SHARE_WEIGHT_KEY)) === '1';
    } catch {
      return false;
    }
  }

  /**
   * Ask for write access and remember the answer.
   *
   * Returns false if the user declines, so the caller can leave the toggle off
   * rather than claiming a permission it does not have.
   */
  static async enableWeightSharing(): Promise<boolean> {
    if (!(await this.ensureInitialized())) return false;

    try {
      const granted = (await requestPermission(WEIGHT_WRITE_PERMISSION)) as Permission[];
      const ok = granted.some(
        (g) => g.recordType === 'Weight' && g.accessType === 'write'
      );
      if (ok) await AsyncStorage.setItem(SHARE_WEIGHT_KEY, '1');
      return ok;
    } catch {
      return false;
    }
  }

  /**
   * Stop sharing.
   *
   * Only clears our own flag — Android owns the permission itself, and already
   * written records stay in Health Connect. The UI says so rather than implying
   * this retracts anything.
   */
  static async disableWeightSharing(): Promise<void> {
    await AsyncStorage.setItem(SHARE_WEIGHT_KEY, '0').catch(() => {});
  }

  /**
   * Write one manually logged weight to Health Connect.
   *
   * Silently does nothing unless the user has opted in. Failures are swallowed:
   * the weight is already saved locally, and a sharing problem must not surface
   * as a failed log.
   */
  static async writeWeight(kg: number, when: Date = new Date()): Promise<boolean> {
    if (!(await this.isWeightSharingEnabled())) return false;
    if (!(await this.ensureInitialized())) return false;
    if (!(kg > 0)) return false;

    try {
      await insertRecords([
        {
          recordType: 'Weight',
          time: when.toISOString(),
          weight: { value: kg, unit: 'kilograms' },
        },
      ] as Parameters<typeof insertRecords>[0]);
      console.log(`[health] wrote weight ${kg}kg to Health Connect`);
      return true;
    } catch (error) {
      console.log('Could not write weight to Health Connect:', error);
      return false;
    }
  }

  // --------------------------------------------------------------------- sync

  /**
   * Pull everything we have permission for into the local cache.
   *
   * First run backfills the full 30-day window Health Connect exposes; later runs
   * read from the last sync minus a day, since sleep records are routinely written
   * hours after the session ends.
   */
  static async syncAll(force = false): Promise<void> {
    // Join an in-flight sync rather than starting a second one alongside it.
    if (this.syncInFlight) return this.syncInFlight;

    this.syncInFlight = this.runSync(force).finally(() => {
      this.syncInFlight = null;
    });
    return this.syncInFlight;
  }

  private static async runSync(force = false): Promise<void> {
    if (!(await this.ensureInitialized())) return;

    const user = await UserService.getCurrentUser();
    if (!user) return;

    const state = await this.getSyncState();
    const lastSync = state?.last_successful_sync_at
      ? new Date(state.last_successful_sync_at)
      : null;

    // A sync-logic fix invalidates previously cached history, so re-read the
    // full window once rather than letting the incremental window skip it.
    const storedVersion = await AsyncStorage.getItem(SYNC_VERSION_KEY).catch(() => null);
    const needsBackfill = storedVersion !== String(SYNC_SCHEMA_VERSION);

    if (!force && !needsBackfill && lastSync &&
        Date.now() - lastSync.getTime() < SYNC_DEBOUNCE_MS) {
      return;
    }

    const now = new Date();
    const earliest = new Date(now.getTime() - HISTORY_WINDOW_DAYS * 86400000);
    let start = earliest;
    if (lastSync && !needsBackfill) {
      // Re-read a week, not a day. Source apps revise history well after the
      // fact — a watch that syncs late, or a manual edit, rewrites days that a
      // one-day window would never look at again, leaving whatever was stored
      // first to persist indefinitely.
      const incremental = new Date(lastSync.getTime() - 7 * 86400000);
      start = incremental > earliest ? incremental : earliest;
    }

    if (needsBackfill) {
      // Purge values earlier versions stored incorrectly. Re-reads below
      // repopulate them; without this, rows the new guards would reject just
      // sit in the cache forever because upserts never delete.
      const db = await database.getDatabase();
      await db
        .runAsync(
          `DELETE FROM health_records
           WHERE user_id = ?
             AND ((metric_type IN ('resting_hr', 'heart_rate') AND (value < 25 OR value > 200))
               OR (metric_type = 'hrv' AND (value <= 0 OR value > 500)))`,
          [user.id]
        )
        .catch(() => {});
      await db
        .runAsync(
          `UPDATE health_daily_metrics SET resting_hr = NULL
           WHERE user_id = ? AND (resting_hr < 25 OR resting_hr > 200)`,
          [user.id]
        )
        .catch(() => {});

      // Every daily aggregate before v7 was stored against the wrong date, and
      // the rollup only ever fills values in — it never clears a stale one. So
      // the misdated rows have to be deleted outright; the re-read below writes
      // them back on the correct days.
      await db
        .runAsync(
          `DELETE FROM health_records WHERE user_id = ?
             AND metric_type IN ('steps', 'distance', 'active_calories', 'total_calories', 'exercise')`,
          [user.id]
        )
        .catch(() => {});
      await db
        .runAsync(
          `UPDATE health_daily_metrics
           SET steps = NULL, distance_km = NULL, active_calories = NULL,
               total_calories = NULL, zone_minutes = NULL
           WHERE user_id = ?`,
          [user.id]
        )
        .catch(() => {});

      // Exercise sessions gained columns (heart-rate trace, max HR, calories,
      // distance) after some rows were already written. The upsert only touches
      // named columns, so those rows would keep their NULLs forever — delete and
      // let the re-read below write them complete.
      await db
        .runAsync('DELETE FROM health_exercise_sessions WHERE user_id = ?', [user.id])
        .catch(() => {});
    }

    const granted = await this.getGrantedRecordTypes();
    const startIso = start.toISOString();
    const endIso = now.toISOString();

    // Restrict every read to the user's chosen source app. Undefined means read
    // from all of them, which sums duplicate data when several apps write the
    // same metric.
    const preferredOrigin = await this.getPreferredOrigin();
    const originFilter = this.originFilter(preferredOrigin);
    console.log(`[sync] source: ${preferredOrigin ?? 'all apps'}`);

    // Each reader is independently guarded — one missing permission or malformed
    // record must never blank out the whole tab.
    if (granted.has('SleepSession')) {
      await this.syncSleep(user.id, startIso, endIso, originFilter);
    }
    if (granted.has('HeartRateVariabilityRmssd')) {
      await this.syncHrv(user.id, startIso, endIso, originFilter);
    }
    if (granted.has('RestingHeartRate') || granted.has('HeartRate')) {
      await this.syncRestingHr(user.id, startIso, endIso, granted, originFilter);
    }
    if (granted.has('Steps')) await this.syncSteps(user.id, start, now);
    if (granted.has('Distance')) await this.syncDistance(user.id, start, now);
    if (granted.has('ActiveCaloriesBurned') || granted.has('TotalCaloriesBurned')) {
      await this.syncCalories(user.id, start, now, granted);
    }
    if (granted.has('Weight')) {
      await this.syncWeight(user.id, startIso, endIso, originFilter);
    }
    if (granted.has('ExerciseSession') && granted.has('HeartRate')) {
      await this.syncExercise(user.id, startIso, endIso, originFilter);
    }

    await this.markSynced(true);

    if (needsBackfill) {
      await AsyncStorage.setItem(SYNC_VERSION_KEY, String(SYNC_SCHEMA_VERSION)).catch(
        () => {}
      );
    }
  }

  /** Recent recorded workouts, newest first, for the Health tab. */
  static async getRecentExerciseSessions(limit = 10): Promise<
    {
      hc_record_id: string;
      exercise_name: string;
      title: string | null;
      local_date: string;
      start_time: string;
      end_time: string;
      duration_min: number;
      avg_heart_rate: number | null;
      max_heart_rate: number | null;
      calories: number | null;
      distance_km: number | null;
      steps: number | null;
      hr_samples: string | null;
      zone_minutes: number | null;
    }[]
  > {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];
      return await db.getAllAsync(
        `SELECT hc_record_id, exercise_name, title, local_date, start_time, end_time, duration_min,
                avg_heart_rate, max_heart_rate, calories, distance_km, steps,
                hr_samples, zone_minutes
         FROM health_exercise_sessions
         WHERE user_id = ?
         ORDER BY start_time DESC
         LIMIT ?`,
        [user.id, limit]
      );
    } catch {
      return [];
    }
  }

  /** Lifetime distance in km, for the Journeys ladder. */
  static async getLifetimeDistanceKm(): Promise<number> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return 0;
      const row = await db.getFirstAsync<{ total: number | null }>(
        'SELECT SUM(distance_km) as total FROM health_daily_metrics WHERE user_id = ?',
        [user.id]
      );
      return row?.total ?? 0;
    } catch {
      return 0;
    }
  }

  /**
   * Upsert a health record.
   *
   * `alwaysOverwrite` distinguishes the two kinds of row we store:
   *
   * - Pass-through records (weight) map 1:1 onto a Health Connect record. Keep
   *   the last-modified guard so a stale re-read can't clobber a newer value.
   * - Derived daily rollups (HRV median, resting HR, step totals) are recomputed
   *   from scratch every sync under a synthetic id. Their "last modified" is the
   *   source record's, which is unchanged when a late reading joins the same
   *   night — so the guard would reject the corrected value. These must always
   *   take the freshly computed number.
   */
  private static async upsertRecord(
    userId: number,
    hcRecordId: string,
    metricType: string,
    value: number,
    unit: string,
    startTime: string,
    endTime: string,
    dataOrigin: string,
    lastModified: string,
    alwaysOverwrite = false,
    /**
     * The day this value belongs to.
     *
     * Deriving it from endTime is wrong for daily aggregates: a bucket covering
     * Aug 8 ends at midnight on Aug 9, so every day's steps and calories were
     * filed one day late. Callers that already know the correct day pass it in.
     */
    localDateOverride?: string
  ) {
    const db = await database.getDatabase();
    const guard = alwaysOverwrite
      ? ''
      : 'WHERE excluded.hc_last_modified > health_records.hc_last_modified';

    await db.runAsync(
      `INSERT INTO health_records
         (user_id, hc_record_id, metric_type, value, unit, start_time, end_time,
          local_date, data_origin, hc_last_modified)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(hc_record_id, metric_type) DO UPDATE SET
         value = excluded.value,
         start_time = excluded.start_time,
         end_time = excluded.end_time,
         local_date = excluded.local_date,
         data_origin = excluded.data_origin,
         hc_last_modified = excluded.hc_last_modified
       ${guard}`,
      [
        userId,
        hcRecordId,
        metricType,
        value,
        unit,
        startTime,
        endTime,
        localDateOverride ?? getLocalDateString(new Date(endTime)),
        dataOrigin,
        lastModified,
      ]
    );
  }

  private static async syncSleep(
    userId: number,
    start: string,
    end: string,
    originFilter: string[] | undefined
  ) {
    try {
      const { records } = await readRecords('SleepSession', {
        timeRangeFilter: { operator: 'between', startTime: start, endTime: end },
        dataOriginFilter: originFilter,
      });

      // One transaction for every session: each insert plus its stage rewrite
      // was previously its own transaction, which dominated sync time. Queued so
      // it cannot overlap the score recompute's transactions.
      await database.runInTransaction(async (db) => {
      for (const rec of records) {
        const hcId = rec.metadata?.id;
        if (!hcId) continue;

        const stages = rec.stages ?? [];
        const totals: Record<SleepStageName, number> = {
          awake: 0,
          light: 0,
          deep: 0,
          rem: 0,
          out_of_bed: 0,
          unknown: 0,
        };

        for (const stage of stages) {
          const name = STAGE_NAMES[stage.stage] ?? 'unknown';
          totals[name] += minutesBetween(stage.startTime, stage.endTime);
        }

        const inBed = minutesBetween(rec.startTime, rec.endTime);
        const asleep = totals.light + totals.deep + totals.rem;
        // Sessions without stage data still carry a useful in-bed duration.
        const effectiveAsleep = stages.length === 0 ? inBed : asleep;
        const efficiency = inBed > 0 ? (effectiveAsleep / inBed) * 100 : 0;

        // Attribute to the date sleep ENDED — "Monday night" shows on Tuesday.
        const localDate = getLocalDateString(new Date(rec.endTime));

        await db.runAsync(
          `INSERT INTO health_sleep_sessions
             (user_id, hc_record_id, start_time, end_time, local_date,
              total_duration_min, awake_min, light_min, deep_min, rem_min,
              unknown_min, sleep_efficiency, data_origin, hc_last_modified)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(hc_record_id) DO UPDATE SET
             start_time = excluded.start_time,
             end_time = excluded.end_time,
             local_date = excluded.local_date,
             total_duration_min = excluded.total_duration_min,
             awake_min = excluded.awake_min,
             light_min = excluded.light_min,
             deep_min = excluded.deep_min,
             rem_min = excluded.rem_min,
             unknown_min = excluded.unknown_min,
             sleep_efficiency = excluded.sleep_efficiency,
             data_origin = excluded.data_origin,
             hc_last_modified = excluded.hc_last_modified
           WHERE excluded.hc_last_modified > health_sleep_sessions.hc_last_modified`,
          [
            userId,
            hcId,
            rec.startTime,
            rec.endTime,
            localDate,
            inBed,
            totals.awake,
            totals.light,
            totals.deep,
            totals.rem,
            totals.unknown,
            efficiency,
            rec.metadata?.dataOrigin ?? '',
            rec.metadata?.lastModifiedTime ?? '',
          ]
        );

        const session = await db.getFirstAsync<{ id: number }>(
          'SELECT id FROM health_sleep_sessions WHERE hc_record_id = ?',
          [hcId]
        );
        if (!session) continue;

        // Stages are replaced wholesale: sessions get rewritten with corrected
        // staging hours later, and there's no stable per-stage id to match on.
        // Explicit delete because PRAGMA foreign_keys is off (no CASCADE).
        await db.runAsync('DELETE FROM health_sleep_stages WHERE session_id = ?', [
          session.id,
        ]);

        for (const stage of stages) {
          await db.runAsync(
            `INSERT INTO health_sleep_stages
               (session_id, stage, start_time, end_time, duration_min)
             VALUES (?, ?, ?, ?, ?)`,
            [
              session.id,
              STAGE_NAMES[stage.stage] ?? 'unknown',
              stage.startTime,
              stage.endTime,
              minutesBetween(stage.startTime, stage.endTime),
            ]
          );
        }
      }
      }, 'syncSleep');
    } catch (error) {
      console.log('Sleep sync skipped:', error);
    }
  }

  private static async syncHrv(
    userId: number,
    start: string,
    end: string,
    originFilter: string[] | undefined
  ) {
    try {
      const { records } = await readRecords('HeartRateVariabilityRmssd', {
        timeRangeFilter: { operator: 'between', startTime: start, endTime: end },
        dataOriginFilter: originFilter,
      });

      // Group by the night the reading belongs to, then take the median.
      // RMSSD has heavy motion-artifact outliers, so median beats mean here.
      const byDate = new Map<string, { values: number[]; origin: string; modified: string }>();

      // Prefer overnight readings, but keep daytime ones as a fallback: many
      // devices write a single daily HRV summary at an arbitrary hour, and an
      // overnight-only filter discarded those entirely, leaving HRV blank.
      const overnightByDate = new Map<
        string,
        { values: number[]; origin: string; modified: string }
      >();
      const anyByDate = new Map<
        string,
        { values: number[]; origin: string; modified: string }
      >();

      for (const rec of records) {
        const value = rec.heartRateVariabilityMillis;
        // Guard implausible values; some sources emit 0 as a placeholder.
        if (!(value > 0) || value > 500) continue;

        const time = new Date(rec.time);
        const hour = time.getHours();

        // Evening readings belong to the night that ends tomorrow morning.
        const attributed = new Date(time);
        if (hour >= 18) attributed.setDate(attributed.getDate() + 1);
        const localDate = getLocalDateString(attributed);

        const push = (
          map: Map<string, { values: number[]; origin: string; modified: string }>
        ) => {
          const entry = map.get(localDate) ?? { values: [], origin: '', modified: '' };
          entry.values.push(value);
          entry.origin = rec.metadata?.dataOrigin ?? entry.origin;
          entry.modified = rec.metadata?.lastModifiedTime ?? entry.modified;
          map.set(localDate, entry);
        };

        push(anyByDate);
        if (hour < 10 || hour >= 18) push(overnightByDate);
      }

      console.log(
        `[sync] syncHrv: ${records.length} records -> ${anyByDate.size} days ` +
          `(${[...anyByDate.keys()].sort().join(', ')})`
      );

      for (const [localDate, entry] of anyByDate) {
        byDate.set(localDate, overnightByDate.get(localDate) ?? entry);
      }

      const rows: Parameters<typeof this.upsertRecord>[] = [];
      for (const [localDate, entry] of byDate) {
        const value = median(entry.values);
        if (value === null) continue;
        rows.push([
          userId,
          `hrv-${localDate}`, // synthetic id: one nightly value per date
          'hrv',
          value,
          'ms',
          localDate,
          localDate,
          entry.origin,
          entry.modified || new Date().toISOString(),
          true, // recomputed median — must replace the previous value
          // Pass the date explicitly: a bare "YYYY-MM-DD" parses as UTC
          // midnight, which lands on the previous day west of UTC.
          localDate,
        ]);
      }
      await this.upsertRecordsBatch(rows);
    } catch (error) {
      console.log('HRV sync skipped:', error);
    }
  }

  private static async syncRestingHr(
    userId: number,
    start: string,
    end: string,
    granted: Set<string>,
    originFilter: string[] | undefined
  ) {
    try {
      const byDate = new Map<string, { values: number[]; origin: string; modified: string }>();

      if (granted.has('RestingHeartRate')) {
        const { records } = await readRecords('RestingHeartRate', {
          timeRangeFilter: { operator: 'between', startTime: start, endTime: end },
        dataOriginFilter: originFilter,
        });
        for (const rec of records) {
          // Reject placeholder zeros and impossible rates; a single 0 dragged
          // the daily median and the weekly average down to nonsense.
          const bpm = rec.beatsPerMinute;
          if (!(bpm >= 25 && bpm <= 200)) continue;

          const localDate = getLocalDateString(new Date(rec.time));
          const entry = byDate.get(localDate) ?? { values: [], origin: '', modified: '' };
          entry.values.push(bpm);
          entry.origin = rec.metadata?.dataOrigin ?? entry.origin;
          entry.modified = rec.metadata?.lastModifiedTime ?? entry.modified;
          byDate.set(localDate, entry);
        }
      }

      // Fall back to overnight heart rate only for days Health Connect has no
      // RestingHeartRate record. Previously this was all-or-nothing, so a single
      // recorded day suppressed the fallback for every other day.
      if (granted.has('HeartRate')) {
        // Read the whole sync window. This used to skip any day that already had
        // a resting-HR value, which was a fair optimisation when resting HR was
        // the only thing derived from these samples — but the daily heart-rate
        // trace comes from the same read, so skipping meant the chart never got
        // any data once resting HR was populated.
        const rangeStart = new Date(start);
        const rangeEnd = new Date(end);

        // Newest page first, and follow every page token.
        //
        // This was a plain readRecords call, which returns only the FIRST page
        // and defaults to ascending order — so a month of continuous heart rate
        // came back as the oldest few days and nothing else. Resting HR still
        // looked fine (those old days got values), but today never had a trace,
        // which is why the daily chart never appeared.
        const records = await this.readAllRecords(
          'HeartRate',
          rangeStart.toISOString(),
          rangeEnd.toISOString(),
          undefined,
          { newestFirst: true }
        );
        // Two buckets: overnight samples are the better estimate, but many
        // people don't wear a tracker to bed. Falling back to all-day samples
        // is less precise than a true resting measurement, yet far better than
        // showing nothing — which is what an overnight-only rule produced for
        // anyone who takes their watch off at night.
        const overnight = new Map<string, number[]>();
        const allDay = new Map<string, number[]>();
        // Timed samples per day, kept for the daily heart-rate chart. The other
        // two maps discard the timestamp because they only need the spread.
        const timedByDay = new Map<string, [number, number][]>();

        // Hot loop: a month of continuous heart rate is hundreds of thousands of
        // samples. getLocalDateString does locale formatting, so calling it per
        // sample (twice) dominated the entire sync. Cache by day index instead,
        // and only build a Date when the day actually changes.
        const t0 = Date.now();
        let sampleCount = 0;
        const dayKeyCache = new Map<number, string>();
        const dayKeyFor = (ms: number): string => {
          const dayIndex = Math.floor(ms / 86400000);
          let key = dayKeyCache.get(dayIndex);
          if (key === undefined) {
            key = getLocalDateString(new Date(ms));
            dayKeyCache.set(dayIndex, key);
          }
          return key;
        };

        for (const rec of records) {
          for (const sample of rec.samples ?? []) {
            const bpm = sample.beatsPerMinute;
            if (!(bpm >= 25 && bpm <= 200)) continue; // drop placeholder zeros
            sampleCount++;

            const ms = new Date(sample.time).getTime();
            const time = new Date(ms);
            const hour = time.getHours();

            const dayKey = dayKeyFor(ms);

            const timed = timedByDay.get(dayKey) ?? [];
            timed.push([time.getHours() * 60 + time.getMinutes(), bpm]);
            timedByDay.set(dayKey, timed);

            let dayList = allDay.get(dayKey);
            if (dayList === undefined) {
              dayList = [];
              allDay.set(dayKey, dayList);
            }
            dayList.push(bpm);

            if (hour >= 6 && hour < 23) continue; // overnight bucket only
            // A reading at or after 23:00 belongs to the night ending tomorrow.
            const localDate = hour >= 23 ? dayKeyFor(ms + 86400000) : dayKey;
            let list = overnight.get(localDate);
            if (list === undefined) {
              list = [];
              overnight.set(localDate, list);
            }
            list.push(bpm);
          }
        }
        console.log(
          `[sync] syncRestingHr: processed ${sampleCount} HR samples in ${Date.now() - t0}ms`
        );

        const dates = new Set([...overnight.keys(), ...allDay.keys()]);
        for (const localDate of dates) {
          if (byDate.has(localDate)) continue; // a real record always wins

          const nightValues = overnight.get(localDate) ?? [];
          // The 20th percentile of overnight samples tracks published resting
          // heart rate closely. Require a few readings before trusting it.
          if (nightValues.length >= 5) {
            const estimate = percentile(nightValues, 20);
            if (estimate !== null) {
              byDate.set(localDate, {
                values: [estimate],
                origin: 'derived:overnight_hr',
                modified: new Date().toISOString(),
              });
              continue;
            }
          }

          // No usable overnight data — approximate from the quietest part of
          // the day instead. The 5th percentile is used here because daytime
          // samples include activity, so the low tail is the resting signal.
          const dayValues = allDay.get(localDate) ?? [];
          if (dayValues.length >= 10) {
            const estimate = percentile(dayValues, 5);
            if (estimate !== null) {
              byDate.set(localDate, {
                values: [estimate],
                origin: 'derived:daytime_hr',
                modified: new Date().toISOString(),
              });
            }
          }
        }

        // Downsample each day to ~150 points and store for the daily chart.
        const traceRows: [string, string][] = [];
        for (const [dayKey, timed] of timedByDay) {
          if (timed.length < 5) continue;
          timed.sort((a, b) => a[0] - b[0]);
          const step = Math.max(1, Math.ceil(timed.length / 150));
          const trace: [number, number][] = [];
          for (let i = 0; i < timed.length; i += step) trace.push(timed[i]);
          traceRows.push([dayKey, JSON.stringify(trace)]);
        }

        if (traceRows.length > 0) {
          await database.runInTransaction(async (db) => {
            for (const [dayKey, json] of traceRows) {
              await db.runAsync(
                `INSERT INTO health_daily_metrics (user_id, local_date, hr_samples)
                 VALUES (?, ?, ?)
                 ON CONFLICT(user_id, local_date)
                 DO UPDATE SET hr_samples = excluded.hr_samples`,
                [userId, dayKey, json]
              );
            }
          }, 'dailyHrTraces');
        }
      }

      await this.writeRestingHr(userId, byDate);
    } catch (error) {
      console.log('Resting HR sync skipped:', error);
    }
  }

  /**
   * Read every page of a record type.
   *
   * readRecords is paginated and returns a pageToken when more data exists.
   * Ignoring it means silently getting only the first page — which for
   * continuous heart rate over a month is a small fraction of the samples, and
   * showed up as heart rate existing for only a couple of days.
   *
   * `newestFirst` matters when the page cap can bite: reading ascending means
   * the cap truncates the RECENT end, so today — the day the user is actually
   * looking at — is the first thing lost.
   */
  private static async readAllRecords<T extends 'HeartRate' | 'ExerciseSession'>(
    recordType: T,
    startTime: string,
    endTime: string,
    originFilter: string[] | undefined,
    { maxPages = 40, newestFirst = false }: { maxPages?: number; newestFirst?: boolean } = {}
  ) {
    const all: Awaited<ReturnType<typeof readRecords<T>>>['records'] = [];
    let pageToken: string | undefined;

    for (let page = 0; page < maxPages; page++) {
      const res = await readRecords(recordType, {
        timeRangeFilter: { operator: 'between', startTime, endTime },
        dataOriginFilter: originFilter,
        ascendingOrder: !newestFirst,
        pageSize: 5000,
        ...(pageToken ? { pageToken } : {}),
      } as Parameters<typeof readRecords<T>>[1]);

      all.push(...res.records);
      pageToken = res.pageToken;
      if (!pageToken || res.records.length === 0) break;
    }

    return all;
  }

  /** Every local date in an ISO range, inclusive. */
  private static datesInRange(start: string, end: string): string[] {
    const out: string[] = [];
    const cursor = new Date(start);
    cursor.setHours(0, 0, 0, 0);
    const last = new Date(end);
    while (cursor <= last) {
      out.push(getLocalDateString(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  private static async writeRestingHr(
    userId: number,
    byDate: Map<string, { values: number[]; origin: string; modified: string }>
  ) {
    const rows: Parameters<typeof this.upsertRecord>[] = [];
    for (const [localDate, entry] of byDate) {
      const value = median(entry.values);
      if (value === null) continue;
      rows.push([
        userId,
        `rhr-${localDate}`,
        'resting_hr',
        value,
        'bpm',
        localDate,
        localDate,
        entry.origin,
        entry.modified || new Date().toISOString(),
        true, // recomputed daily value — must replace the previous one
        localDate,
      ]);
    }
    await this.upsertRecordsBatch(rows);
  }

  /**
   * Steps and calories use aggregateRecord rather than raw reads: Health Connect
   * de-duplicates across sources for us and returns one number per day instead of
   * hundreds of rows.
   */
  private static async syncSteps(userId: number, start: Date, end: Date) {
    // Health Connect returns this as COUNT_TOTAL (not STEPS_COUNT_TOTAL).
    await this.aggregateDaily(userId, start, end, 'Steps', 'steps', 'count', (result) =>
      (result as { COUNT_TOTAL?: number }).COUNT_TOTAL ?? 0
    );
  }

  /**
   * Real distance from the device, not estimated from steps. The aggregate key
   * is DISTANCE and it returns a LengthResult, so read `.inKilometers`.
   */
  private static async syncDistance(userId: number, start: Date, end: Date) {
    await this.aggregateDaily(userId, start, end, 'Distance', 'distance', 'km', (result) =>
      (result as { DISTANCE?: { inKilometers: number } }).DISTANCE?.inKilometers ?? 0
    );
  }

  private static async syncCalories(
    userId: number,
    start: Date,
    end: Date,
    granted: Set<string>
  ) {
    if (granted.has('ActiveCaloriesBurned')) {
      await this.aggregateDaily(
        userId,
        start,
        end,
        'ActiveCaloriesBurned',
        'active_calories',
        'kcal',
        (result) =>
          (result as { ACTIVE_CALORIES_TOTAL?: { inKilocalories: number } })
            .ACTIVE_CALORIES_TOTAL?.inKilocalories ?? 0
      );
    }
    if (granted.has('TotalCaloriesBurned')) {
      await this.aggregateDaily(
        userId,
        start,
        end,
        'TotalCaloriesBurned',
        'total_calories',
        'kcal',
        (result) =>
          (result as { ENERGY_TOTAL?: { inKilocalories: number } }).ENERGY_TOTAL
            ?.inKilocalories ?? 0
      );
    }
  }

  private static async aggregateDaily(
    userId: number,
    start: Date,
    end: Date,
    recordType: 'Steps' | 'Distance' | 'ActiveCaloriesBurned' | 'TotalCaloriesBurned',
    metricType: string,
    unit: string,
    extract: (result: unknown) => number
  ) {
    try {
      // Snap to local midnight so each 1-day slice lines up with a calendar day.
      // Health Connect slices forward from startTime, so a mid-day start would
      // produce buckets running noon-to-noon and split every day's total across
      // two rows — which is why figures disagreed with the source app.
      const rangeStart = new Date(start);
      rangeStart.setHours(0, 0, 0, 0);
      const now = new Date();
      // Never query past the present moment: TotalCaloriesBurned fills any
      // future part of a window with projected basal burn, so a window ending at
      // 23:59 would report a whole day's calories at 11am.
      const rangeEnd = end > now ? now : end;
      if (rangeEnd <= rangeStart) return;

      // One grouped call for the whole range. Querying day by day meant 30
      // sequential IPC round-trips per metric — with four metrics that was 120
      // calls per sync, which is what made syncing take minutes.
      const preferredOrigin = await this.getPreferredOrigin();

      const groups = await aggregateGroupByPeriod({
        recordType,
        timeRangeFilter: {
          operator: 'between',
          startTime: rangeStart.toISOString(),
          endTime: rangeEnd.toISOString(),
        },
        timeRangeSlicer: { period: 'DAYS', length: 1 },
        // Without this, totals are the sum of every app writing this type.
        dataOriginFilter: this.originFilter(preferredOrigin),
      } as Parameters<typeof aggregateGroupByPeriod>[0]);

      const rows: Parameters<typeof this.upsertRecord>[] = [];
      const syncedAt = new Date().toISOString();

      // Health Connect aggregates across every app that writes this type. If
      // both a wearable and the phone's own sensor record steps, the total is
      // the sum of both and will exceed what either app shows on its own.
      const origins = new Set<string>();
      for (const group of groups) {
        for (const o of (group.result as { dataOrigins?: string[] }).dataOrigins ?? []) {
          origins.add(o);
        }
      }
      console.log(
        `[sync] ${metricType}: ${groups.length} day-buckets from ` +
          `${rangeStart.toISOString()} to ${rangeEnd.toISOString()} | ` +
          `sources: ${[...origins].join(', ') || 'none'}`
      );

      for (const group of groups) {
        const value = extract(group.result);
        if (!(value > 0)) continue;
        // Attribute by the bucket's START. Health Connect slices from
        // rangeStart, which is snapped to local midnight above, so each bucket
        // covers one local day.
        const localDate = getLocalDateString(new Date(group.startTime));
        console.log(
          `[sync]   ${metricType} ${localDate}: ${Math.round(value)} ` +
            `(${group.startTime} -> ${group.endTime})`
        );
        rows.push([
          userId,
          `${metricType}-${localDate}`,
          metricType,
          value,
          unit,
          group.startTime,
          group.endTime,
          'aggregate',
          syncedAt,
          true, // daily total, recomputed each sync as the day fills in
          // A bucket for Aug 8 ends at midnight on Aug 9, so the date must be
          // taken from the start, not derived from endTime.
          localDate,
        ]);
      }

      await this.upsertRecordsBatch(rows);
    } catch (error) {
      console.log(`${metricType} aggregate skipped:`, error);
    }
  }

  /**
   * Write many records in one transaction.
   *
   * Each runAsync is otherwise its own implicit transaction with its own disk
   * sync, so writing 30 days one at a time is dramatically slower than batching.
   */
  private static async upsertRecordsBatch(
    rows: Parameters<typeof HealthConnectService.upsertRecord>[]
  ) {
    if (rows.length === 0) return;
    await database.runInTransaction(async () => {
      for (const args of rows) {
        await this.upsertRecord(...args);
      }
    }, 'upsertRecordsBatch');
  }

  private static async syncWeight(
    userId: number,
    start: string,
    end: string,
    originFilter: string[] | undefined
  ) {
    try {
      const { records } = await readRecords('Weight', {
        timeRangeFilter: { operator: 'between', startTime: start, endTime: end },
        dataOriginFilter: originFilter,
      });
      for (const rec of records) {
        const hcId = rec.metadata?.id;
        if (!hcId) continue;
        await this.upsertRecord(
          userId,
          hcId,
          'weight',
          rec.weight.inKilograms,
          'kg',
          rec.time,
          rec.time,
          rec.metadata?.dataOrigin ?? '',
          rec.metadata?.lastModifiedTime ?? ''
        );
      }
    } catch (error) {
      console.log('Weight sync skipped:', error);
    }
  }

  /**
   * Zone minutes and cardio load, derived from HR samples inside exercise sessions.
   * Both land as daily rollups keyed by the session's end date.
   */
  private static async syncExercise(
    userId: number,
    start: string,
    end: string,
    originFilter: string[] | undefined
  ) {
    try {
      const sessionRecords = await this.readAllRecords(
        'ExerciseSession',
        start,
        end,
        originFilter
      );

      // No sessions means no zone minutes to compute — and, crucially, no reason
      // to pull a month of heart rate samples.
      if (sessionRecords.length === 0) return;

      // Read heart rate only across the span the sessions actually cover, not
      // the whole 30-day window. A continuous monitor writes a sample every few
      // seconds, so an unbounded read returns hundreds of thousands of points
      // and blocks the JS thread for the entire time it is being processed.
      const sessionStart = sessionRecords.reduce(
        (min, s) => (s.startTime < min ? s.startTime : min),
        sessionRecords[0].startTime
      );
      const sessionEnd = sessionRecords.reduce(
        (max, s) => (s.endTime > max ? s.endTime : max),
        sessionRecords[0].endTime
      );

      const t0 = Date.now();
      const hrRecords = await this.readAllRecords(
        'HeartRate',
        sessionStart,
        sessionEnd,
        originFilter
      );

      const samples: { time: number; bpm: number }[] = [];
      for (const rec of hrRecords) {
        for (const sample of rec.samples ?? []) {
          samples.push({ time: new Date(sample.time).getTime(), bpm: sample.beatsPerMinute });
        }
      }
      samples.sort((a, b) => a.time - b.time);
      console.log(
        `[sync] syncExercise: ${sessionRecords.length} sessions, ${samples.length} HR samples in ${Date.now() - t0}ms`
      );

      // Measured max HR if the user supplied one, else Tanaka (208 - 0.7 x age),
      // else an age-less default. Tiles are labelled EST. when estimated.
      const profile = await HealthProfileService.getProfile();
      const maxHr = profile.maxHr;

      const zoneByDate = new Map<string, number>();
      const loadByDate = new Map<string, number>();

      // samples is sorted, so each session's slice is found by binary search
      // rather than scanning the whole array. The previous .filter() per session
      // was O(sessions x samples), which with a month of continuous heart rate
      // data is tens of millions of comparisons on the UI thread.
      const lowerBound = (t: number) => {
        let lo = 0;
        let hi = samples.length;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (samples[mid].time < t) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };

      const sessionRows: (string | number | null)[][] = [];

      for (const session of sessionRecords) {
        const sStart = new Date(session.startTime).getTime();
        const sEnd = new Date(session.endTime).getTime();
        const from = lowerBound(sStart);
        const to = lowerBound(sEnd + 1);
        const inSession = samples.slice(from, to);

        const localDate = getLocalDateString(new Date(session.endTime));
        const threshold = 0.7 * maxHr;
        const sessionMinutes = (sEnd - sStart) / 60000;
        const sessionAvgHr =
          inSession.length > 0
            ? inSession.reduce((sum, x) => sum + x.bpm, 0) / inSession.length
            : null;
        const sessionMaxHr =
          inSession.length > 0 ? Math.max(...inSession.map((x) => x.bpm)) : null;

        // Downsample to ~200 points. A long workout can hold thousands of
        // samples, which is far more than a phone-width chart can show and
        // enough JSON to slow the row down for no visible gain.
        const MAX_POINTS = 200;
        const step = Math.max(1, Math.ceil(inSession.length / MAX_POINTS));
        const trace: [number, number][] = [];
        for (let i = 0; i < inSession.length; i += step) {
          trace.push([
            Math.round((inSession[i].time - sStart) / 1000),
            Math.round(inSession[i].bpm),
          ]);
        }
        const hrSamplesJson = trace.length > 1 ? JSON.stringify(trace) : null;

        // Calories, distance and steps for just this session's window.
        //
        // aggregateRecord, not aggregateGroupByPeriod: the grouped call slices
        // the range into whole DAYS, and a range shorter than one slice returns
        // no buckets at all — so every workout summed to zero and stored null.
        // A plain aggregate over the exact instant window has no slicer and is
        // one IPC call instead of one per bucket.
        const windowFilter = {
          operator: 'between' as const,
          startTime: session.startTime,
          endTime: session.endTime,
        };
        const [cal, dist, stepCount] = await Promise.all([
          aggregateRecord({
            recordType: 'ActiveCaloriesBurned',
            timeRangeFilter: windowFilter,
          }).catch(() => null),
          aggregateRecord({
            recordType: 'Distance',
            timeRangeFilter: windowFilter,
          }).catch(() => null),
          // Steps are what a walk is actually measured in, so they belong on
          // the session next to distance rather than only in the daily total.
          aggregateRecord({
            recordType: 'Steps',
            timeRangeFilter: windowFilter,
          }).catch(() => null),
        ]);

        const positive = (n: number | undefined) => (n != null && n > 0 ? n : null);
        const sessionCalories = positive(cal?.ACTIVE_CALORIES_TOTAL?.inKilocalories);
        const sessionDistanceKm = positive(dist?.DISTANCE?.inKilometers);
        const sessionSteps = positive(stepCount?.COUNT_TOTAL);

        // Minutes at or above 70% of max HR — the conventional moderate-plus
        // threshold. Computed here rather than after the no-heart-rate guard
        // below so it can be stored on the session row: it was previously only
        // rolled into the daily total, which left the workout's own ZONE MIN
        // column permanently null.
        let zoneMinutes: number | null = null;
        if (inSession.length > 0) {
          let acc = 0;
          for (let i = 0; i < inSession.length; i++) {
            // Each sample stands for the span until the next one, capped so a
            // gap in the data can't inflate the total.
            const next = inSession[i + 1]?.time ?? sEnd;
            const spanMin = Math.min((next - inSession[i].time) / 60000, 5);
            if (inSession[i].bpm >= threshold) acc += spanMin;
          }
          zoneMinutes = acc;
        }

        // Store the session itself before the heart-rate guard below. A workout
        // logged without heart rate — a phone-tracked strength session, say —
        // still happened and should still be listed, even though it cannot
        // contribute zone minutes or training load.
        const hcId = session.metadata?.id;
        if (hcId) {
          sessionRows.push([
            userId,
            hcId,
            session.exerciseType ?? 0,
            exerciseName(session.exerciseType ?? 0),
            session.title ?? null,
            session.startTime,
            session.endTime,
            localDate,
            sessionMinutes,
            sessionAvgHr,
            sessionMaxHr,
            hrSamplesJson,
            sessionCalories,
            sessionDistanceKm,
            sessionSteps,
            zoneMinutes,
            session.metadata?.dataOrigin ?? '',
          ]);
        }

        if (inSession.length === 0 || zoneMinutes == null) continue;

        zoneByDate.set(localDate, (zoneByDate.get(localDate) ?? 0) + zoneMinutes);

        // Banister's TRIMP (1991): duration x heart-rate-reserve fraction x an
        // exponential weighting that follows the blood lactate response curve.
        // The exponent differs by sex, so HealthProfileService owns that choice.
        const avgHr = inSession.reduce((sum, s) => sum + s.bpm, 0) / inSession.length;
        const rhrRow = await this.getMetricValue(userId, 'resting_hr', localDate);
        const rhr = rhrRow ?? 60;
        const reserve = Math.max(1, maxHr - rhr);
        const hrr = Math.max(0, (avgHr - rhr) / reserve);
        const durationMin = (sEnd - sStart) / 60000;
        const load =
          durationMin * hrr * HealthProfileService.trimpWeight(hrr, profile.biologicalSex);
        loadByDate.set(localDate, (loadByDate.get(localDate) ?? 0) + load);
      }

      if (sessionRows.length > 0) {
        await database.runInTransaction(async (db) => {
          for (const r of sessionRows) {
            await db.runAsync(
              `INSERT INTO health_exercise_sessions
                 (user_id, hc_record_id, exercise_type, exercise_name, title,
                  start_time, end_time, local_date, duration_min, avg_heart_rate,
                  max_heart_rate, hr_samples, calories, distance_km, steps,
                  zone_minutes, data_origin)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(hc_record_id) DO UPDATE SET
                 exercise_type = excluded.exercise_type,
                 exercise_name = excluded.exercise_name,
                 title = excluded.title,
                 start_time = excluded.start_time,
                 end_time = excluded.end_time,
                 local_date = excluded.local_date,
                 duration_min = excluded.duration_min,
                 avg_heart_rate = excluded.avg_heart_rate,
                 max_heart_rate = excluded.max_heart_rate,
                 hr_samples = excluded.hr_samples,
                 zone_minutes = excluded.zone_minutes,
                 calories = COALESCE(excluded.calories, health_exercise_sessions.calories),
                 distance_km = COALESCE(excluded.distance_km, health_exercise_sessions.distance_km),
                 steps = COALESCE(excluded.steps, health_exercise_sessions.steps)`,
              r
            );
          }
        }, 'syncExerciseSessions');
        console.log(`[sync] stored ${sessionRows.length} exercise sessions`);
      }

      for (const [localDate, minutes] of zoneByDate) {
        await this.upsertRecord(
          userId,
          `zone-${localDate}`,
          'exercise',
          minutes,
          'min',
          localDate,
          localDate,
          'derived',
          new Date().toISOString(),
          true, // recomputed from the day's sessions each sync
          localDate
        );
      }

      const db = await database.getDatabase();
      for (const [localDate, load] of loadByDate) {
        await db.runAsync(
          `INSERT INTO health_daily_metrics (user_id, local_date, cardio_load)
           VALUES (?, ?, ?)
           ON CONFLICT(user_id, local_date) DO UPDATE SET cardio_load = excluded.cardio_load`,
          [userId, localDate, load]
        );
      }
    } catch (error) {
      console.log('Exercise sync skipped:', error);
    }
  }

  private static async getMetricValue(
    userId: number,
    metricType: string,
    localDate: string
  ): Promise<number | null> {
    const db = await database.getDatabase();
    const row = await db.getFirstAsync<{ value: number }>(
      'SELECT value FROM health_records WHERE user_id = ? AND metric_type = ? AND local_date = ? LIMIT 1',
      [userId, metricType, localDate]
    );
    return row?.value ?? null;
  }

  // --------------------------------------------------------------- read paths

  static async getDailyMetrics(days: number): Promise<HealthDailyMetrics[]> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return [];
      return await db.getAllAsync<HealthDailyMetrics>(
        `SELECT * FROM health_daily_metrics
         WHERE user_id = ?
         ORDER BY local_date DESC
         LIMIT ?`,
        [user.id, days]
      );
    } catch {
      return [];
    }
  }

  static async getSleepSessionWithStages(
    localDate: string
  ): Promise<{ session: HealthSleepSession; stages: HealthSleepStage[] } | null> {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;

      // Longest session wins when a night has several fragments.
      const session = await db.getFirstAsync<HealthSleepSession>(
        `SELECT * FROM health_sleep_sessions
         WHERE user_id = ? AND local_date = ?
         ORDER BY total_duration_min DESC
         LIMIT 1`,
        [user.id, localDate]
      );
      if (!session) return null;

      const stages = await db.getAllAsync<HealthSleepStage>(
        'SELECT * FROM health_sleep_stages WHERE session_id = ? ORDER BY start_time ASC',
        [session.id]
      );
      return { session, stages };
    } catch {
      return null;
    }
  }

  /** Most recent sleep session on or before the given date. */
  static async getLatestSleepSession(): Promise<
    { session: HealthSleepSession; stages: HealthSleepStage[] } | null
  > {
    try {
      const db = await database.getDatabase();
      const user = await UserService.getCurrentUser();
      if (!user) return null;
      const session = await db.getFirstAsync<HealthSleepSession>(
        `SELECT * FROM health_sleep_sessions
         WHERE user_id = ?
         ORDER BY end_time DESC
         LIMIT 1`,
        [user.id]
      );
      if (!session) return null;
      const stages = await db.getAllAsync<HealthSleepStage>(
        'SELECT * FROM health_sleep_stages WHERE session_id = ? ORDER BY start_time ASC',
        [session.id]
      );
      return { session, stages };
    } catch {
      return null;
    }
  }
}
