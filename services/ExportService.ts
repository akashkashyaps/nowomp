import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { database, type Workout, type Skip } from '@/database/database';
import { UserService } from './UserService';
import { NotificationService } from './NotificationService';
import { getTodayLocal } from '@/utils/dateUtils';

export class ExportService {
  static async exportToCSV(): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    // Get all data
    const workouts = await db.getAllAsync<Workout>(
      'SELECT * FROM workouts WHERE user_id = ? ORDER BY workout_date DESC',
      [user.id]
    );

    const skips = await db.getAllAsync<Skip>(
      'SELECT * FROM skips WHERE user_id = ? ORDER BY skip_date DESC',
      [user.id]
    );

    // Wrap in quotes and double any embedded quote, per RFC 4180. Excuse text
    // is free-form, so an unescaped quote or newline would corrupt the file.
    const csvCell = (value: unknown): string =>
      `"${String(value ?? '').replace(/"/g, '""')}"`;

    // Create CSV content
    let csvContent = 'Type,Date,Details,Verified\n';

    workouts.forEach(workout => {
      csvContent += `Workout,${csvCell(workout.workout_date)},Gym workout,${workout.verified}\n`;
    });

    skips.forEach(skip => {
      csvContent += `Skip,${csvCell(skip.skip_date)},${csvCell(skip.excuse)},false\n`;
    });

    // Save and share using new File API
    const fileName = `gym-data-${new Date().toISOString().split('T')[0]}.csv`;
    const file = new File(Paths.cache, fileName);

    file.write(csvContent);

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(file.uri);
    }
  }

  static async exportAllData(): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();

    if (!user) throw new Error('No user found');

    try {
      // Get ALL data from ALL tables (including freeze tokens, excuses, redemptions)
      const [
        workouts,
        skips,
        scheduledWorkouts,
        gyms,
        schedules,
        freezeTokens,
        excuseSubmissions,
        redemptionWorkouts,
        dailyJournal,
        journeyCompletions,
        healthProfile,
        healthDailyMetrics,
        healthSleepSessions,
        healthSleepStages,
        healthRecords,
        scheduleChangeLogs,
        excuseMessageCycles,
        healthExerciseSessions,
        achievements,
        experiments,
        experimentCheckins
      ] = await Promise.all([
        db.getAllAsync('SELECT * FROM workouts WHERE user_id = ? ORDER BY workout_date DESC', [user.id]),
        db.getAllAsync('SELECT * FROM skips WHERE user_id = ? ORDER BY skip_date DESC', [user.id]),
        db.getAllAsync('SELECT * FROM scheduled_workouts WHERE user_id = ? ORDER BY workout_date DESC', [user.id]),
        db.getAllAsync('SELECT * FROM gyms WHERE user_id = ?', [user.id]),
        db.getAllAsync('SELECT * FROM schedules WHERE user_id = ? ORDER BY updated_at DESC', [user.id]),
        db.getAllAsync('SELECT * FROM freeze_tokens WHERE user_id = ? ORDER BY earned_at DESC', [user.id]),
        db.getAllAsync('SELECT * FROM excuse_submissions WHERE user_id = ? ORDER BY submitted_at DESC', [user.id]),
        db.getAllAsync('SELECT * FROM redemption_workouts WHERE user_id = ? ORDER BY triggered_at DESC', [user.id]),
        // Health data the user typed themselves. Unlike the synced metrics
        // (steps, HRV, sleep) these cannot be re-derived from Health Connect,
        // so omitting them from the backup silently destroyed them on restore.
        db.getAllAsync('SELECT * FROM daily_journal WHERE user_id = ? ORDER BY local_date DESC', [user.id]),
        db.getAllAsync('SELECT * FROM journey_completions WHERE user_id = ? ORDER BY journey_km ASC', [user.id]),
        db.getFirstAsync<{ age: number | null; biological_sex: string | null; sleep_goal_min: number | null; max_hr_measured: number | null; steps_goal: number | null }>(
          'SELECT age, biological_sex, sleep_goal_min, max_hr_measured, steps_goal FROM users WHERE id = ?',
          [user.id]
        ),
        // Health history. Health Connect only serves the last 30 days, so
        // anything older exists ONLY in this local cache — on a new phone it is
        // unrecoverable unless it travels in the backup. This is usually the
        // largest part of the file and the whole reason to keep one.
        db.getAllAsync('SELECT * FROM health_daily_metrics WHERE user_id = ? ORDER BY local_date DESC', [user.id]),
        db.getAllAsync('SELECT * FROM health_sleep_sessions WHERE user_id = ? ORDER BY local_date DESC', [user.id]),
        // Stages hang off sessions rather than the user, so they are selected
        // through a join instead of a user_id column.
        db.getAllAsync(
          `SELECT st.* FROM health_sleep_stages st
           JOIN health_sleep_sessions s ON s.id = st.session_id
           WHERE s.user_id = ?`,
          [user.id]
        ),
        // Manually logged weight lives here with data_origin='manual' and is
        // not re-derivable from any device.
        db.getAllAsync('SELECT * FROM health_records WHERE user_id = ? ORDER BY local_date DESC', [user.id]),
        db.getAllAsync('SELECT * FROM schedule_change_logs WHERE user_id = ? ORDER BY changed_at DESC', [user.id]),
        db.getAllAsync('SELECT * FROM excuse_message_cycles WHERE user_id = ?', [user.id]),
        db.getAllAsync('SELECT * FROM health_exercise_sessions WHERE user_id = ? ORDER BY start_time DESC', [user.id]),
        // Trophies and experiments (v6). Neither can be re-derived: unlock
        // dates and experiment results are history.
        db.getAllAsync('SELECT * FROM achievements WHERE user_id = ?', [user.id]),
        db.getAllAsync('SELECT * FROM experiments WHERE user_id = ? ORDER BY id ASC', [user.id]),
        db.getAllAsync(
          `SELECT c.* FROM experiment_checkins c
           JOIN experiments e ON e.id = c.experiment_id
           WHERE e.user_id = ?`,
          [user.id]
        )
      ]);

      // Calculate checksums for data integrity
      const totalRecords =
        (workouts?.length || 0) +
        (skips?.length || 0) +
        (scheduledWorkouts?.length || 0) +
        (gyms?.length || 0) +
        (schedules?.length || 0) +
        (freezeTokens?.length || 0) +
        (excuseSubmissions?.length || 0) +
        (redemptionWorkouts?.length || 0) +
        (dailyJournal?.length || 0) +
        (journeyCompletions?.length || 0) +
        (healthDailyMetrics?.length || 0) +
        (healthSleepSessions?.length || 0) +
        (healthSleepStages?.length || 0) +
        (healthRecords?.length || 0) +
        (scheduleChangeLogs?.length || 0) +
        (excuseMessageCycles?.length || 0) +
        (healthExerciseSessions?.length || 0) +
        (achievements?.length || 0) +
        (experiments?.length || 0) +
        (experimentCheckins?.length || 0);

      const exportData = {
        // 6.0 adds trophies, experiments and their check-ins.
        // 5.0 adds recorded exercise sessions (the workout list).
        // 4.0 added the full health history — daily metrics, sleep sessions and
        // stages, raw records — plus schedule-change and message-cycle logs.
        // Import still accepts 1.0 through 3.0.
        version: '6.0',
        exportDate: new Date().toISOString(),
        user: {
          display_name: user.display_name,
          created_at: user.created_at,
          schedule_changes: user.schedule_changes || 0,
          highest_streak: user.highest_streak || 0,
          // Health profile fields drive the scoring formulas (Tanaka max HR,
          // NSF sleep bands, TRIMP sex coefficient) and are user-entered.
          age: healthProfile?.age ?? null,
          biological_sex: healthProfile?.biological_sex ?? null,
          sleep_goal_min: healthProfile?.sleep_goal_min ?? null,
          max_hr_measured: healthProfile?.max_hr_measured ?? null,
          steps_goal: healthProfile?.steps_goal ?? null
        },
        data: {
          workouts,
          skips,
          scheduledWorkouts,
          gyms,
          schedules,
          freezeTokens,
          excuseSubmissions,
          redemptionWorkouts,
          dailyJournal,
          journeyCompletions,
          healthDailyMetrics,
          healthSleepSessions,
          healthSleepStages,
          healthRecords,
          scheduleChangeLogs,
          excuseMessageCycles,
          healthExerciseSessions,
          achievements,
          experiments,
          experimentCheckins
        },
        checksums: {
          totalRecords,
          recordCounts: {
            workouts: workouts?.length || 0,
            skips: skips?.length || 0,
            scheduledWorkouts: scheduledWorkouts?.length || 0,
            gyms: gyms?.length || 0,
            schedules: schedules?.length || 0,
            freezeTokens: freezeTokens?.length || 0,
            excuseSubmissions: excuseSubmissions?.length || 0,
            redemptionWorkouts: redemptionWorkouts?.length || 0,
            dailyJournal: dailyJournal?.length || 0,
            journeyCompletions: journeyCompletions?.length || 0,
            healthDailyMetrics: healthDailyMetrics?.length || 0,
            healthSleepSessions: healthSleepSessions?.length || 0,
            healthSleepStages: healthSleepStages?.length || 0,
            healthRecords: healthRecords?.length || 0,
            scheduleChangeLogs: scheduleChangeLogs?.length || 0,
            excuseMessageCycles: excuseMessageCycles?.length || 0,
            healthExerciseSessions: healthExerciseSessions?.length || 0,
            achievements: achievements?.length || 0,
            experiments: experiments?.length || 0,
            experimentCheckins: experimentCheckins?.length || 0
          }
        },
        metadata: {
          appVersion: Constants.expoConfig?.version ?? 'unknown',
          exportFormat: 'json',
          platform: 'react-native'
        }
      };

      const jsonString = JSON.stringify(exportData, null, 2);
      const fileName = `nowomp-backup-${new Date().toISOString().split('T')[0]}.json`;
      const file = new File(Paths.cache, fileName);

      file.write(jsonString);

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export NoWomp Data'
        });
      }

      console.log(`Exported ${totalRecords} total records`);
    } catch (error) {
      console.error('Export error:', error);
      throw new Error('Failed to export data');
    }
  }

  static async importData(fileUri: string): Promise<void> {
    const db = await database.getDatabase();
    const currentUser = await UserService.getCurrentUser();

    if (!currentUser) throw new Error('No user found');

    try {
      // FIXED: Added await for file.text()
      const file = new File(fileUri);
      const fileContent = await file.text();
      const importData = JSON.parse(fileContent);

      // Validate file format
      if (!importData.version || !importData.data) {
        throw new Error('Invalid backup file format');
      }

      // Support both v1.0 and v2.0 formats
      const version = importData.version;
      console.log(`Importing backup version: ${version}`);

      const {
        workouts,
        skips,
        scheduledWorkouts,
        gyms,
        schedules,
        freezeTokens,
        excuseSubmissions,
        redemptionWorkouts,
        dailyJournal,
        journeyCompletions,
        healthDailyMetrics,
        healthSleepSessions,
        healthRecords
      } = importData.data;

      // Validate checksums if available (v2.0+). Counts every array in the
      // file rather than a hand-kept list: the old list forgot exercise
      // sessions, so every v5 backup with recorded workouts failed to import.
      const countAll = (d: Record<string, unknown>) =>
        Object.values(d).reduce<number>((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
      if (importData.checksums) {
        const expectedTotal = importData.checksums.totalRecords;
        const actualTotal = countAll(importData.data);
        if (expectedTotal !== actualTotal) {
          throw new Error(`Data integrity check failed: Expected ${expectedTotal} records, found ${actualTotal}`);
        }
      }

      // Calculate total records for confirmation
      const totalRecords = countAll(importData.data);

      // Build detailed record breakdown
      const breakdown = [
        `Workouts: ${workouts?.length || 0}`,
        `Skips: ${skips?.length || 0}`,
        `Scheduled Workouts: ${scheduledWorkouts?.length || 0}`,
        `Gyms: ${gyms?.length || 0}`,
        `Schedules: ${schedules?.length || 0}`,
        `Freeze Tokens: ${freezeTokens?.length || 0}`,
        `Excuse Submissions: ${excuseSubmissions?.length || 0}`,
        `Redemption Workouts: ${redemptionWorkouts?.length || 0}`,
        `Journal Entries: ${dailyJournal?.length || 0}`,
        `Journeys Completed: ${journeyCompletions?.length || 0}`,
        `Health Days: ${healthDailyMetrics?.length || 0}`,
        `Sleep Nights: ${healthSleepSessions?.length || 0}`,
        `Health Readings: ${healthRecords?.length || 0}`,
        `Trophies: ${importData.data.achievements?.length || 0}`,
        `Experiments: ${importData.data.experiments?.length || 0}`
      ].join('\n');

      // Show confirmation dialog
      Alert.alert(
        'Import Backup',
        `Found ${totalRecords} records to import:\n\n${breakdown}\n\nThis will REPLACE ALL your current data. Continue?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            style: 'destructive',
            onPress: async () => {
              await this.performImport(db, currentUser.id, importData.data, importData.user);
            }
          }
        ]
      );

    } catch (error: any) {
      console.error('Import error:', error);
      Alert.alert('Import Failed', error.message || 'Invalid file format or corrupted data');
      throw error;
    }
  }

  private static async performImport(db: any, userId: number, data: any, user?: any): Promise<void> {
    const {
      workouts,
      skips,
      scheduledWorkouts,
      gyms,
      schedules,
      freezeTokens,
      excuseSubmissions,
      redemptionWorkouts,
      dailyJournal,
      journeyCompletions,
      healthDailyMetrics,
      healthSleepSessions,
      healthSleepStages,
      healthRecords,
      scheduleChangeLogs,
      excuseMessageCycles,
      healthExerciseSessions,
      achievements,
      experiments,
      experimentCheckins
    } = data;

    try {
      // Use transaction for atomic import (all-or-nothing)
      await db.execAsync('BEGIN TRANSACTION');

      try {
        // Clear existing data (in correct order to respect foreign keys)
        await db.runAsync(
          'DELETE FROM experiment_checkins WHERE experiment_id IN (SELECT id FROM experiments WHERE user_id = ?)',
          [userId]
        );
        await db.runAsync('DELETE FROM experiments WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM achievements WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM redemption_workouts WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM excuse_submissions WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM freeze_tokens WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM workouts WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM skips WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM scheduled_workouts WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM gyms WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM schedules WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM daily_journal WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM journey_completions WHERE user_id = ?', [userId]);
        // Stages reference sessions, so they must go first.
        await db.runAsync(
          `DELETE FROM health_sleep_stages WHERE session_id IN
             (SELECT id FROM health_sleep_sessions WHERE user_id = ?)`,
          [userId]
        );
        await db.runAsync('DELETE FROM health_sleep_sessions WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM health_daily_metrics WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM health_records WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM schedule_change_logs WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM excuse_message_cycles WHERE user_id = ?', [userId]);
        await db.runAsync('DELETE FROM health_exercise_sessions WHERE user_id = ?', [userId]);

        console.log('Cleared existing data for user');

        // Row ids change on insert, so links between workouts, excuses, freeze
        // tokens and redemptions are re-pointed through these maps. Without
        // them a restored redemption shows the wrong excuse and workout.
        const workoutIds = new Map<number, number>();
        const excuseIds = new Map<number, number>();
        const tokenIds = new Map<number, number>();
        const remap = (map: Map<number, number>, id: number | null | undefined) =>
          id == null ? null : map.get(id) ?? null;

        // Import workouts
        if (workouts && workouts.length > 0) {
          for (const workout of workouts) {
            const res = await db.runAsync(
              'INSERT INTO workouts (user_id, verified, workout_date, duration, status, started_at, ended_at, activity, place_name, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [userId, workout.verified, workout.workout_date, workout.duration, workout.status, workout.started_at, workout.ended_at, workout.activity ?? null, workout.place_name ?? null, workout.created_at]
            );
            if (workout.id != null) workoutIds.set(workout.id, res.lastInsertRowId);
          }
          console.log(`Imported ${workouts.length} workouts`);
        }

        // Import skips
        if (skips && skips.length > 0) {
          for (const skip of skips) {
            await db.runAsync(
              'INSERT INTO skips (user_id, excuse, skip_date, scheduled_time, created_at) VALUES (?, ?, ?, ?, ?)',
              [userId, skip.excuse, skip.skip_date, skip.scheduled_time ?? null, skip.created_at]
            );
          }
          console.log(`Imported ${skips.length} skips`);
        }

        // Import scheduled workouts
        if (scheduledWorkouts && scheduledWorkouts.length > 0) {
          for (const scheduledWorkout of scheduledWorkouts) {
            await db.runAsync(
              'INSERT INTO scheduled_workouts (user_id, workout_date, workout_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
              [userId, scheduledWorkout.workout_date, scheduledWorkout.workout_time, scheduledWorkout.created_at, scheduledWorkout.updated_at]
            );
          }
          console.log(`Imported ${scheduledWorkouts.length} scheduled workouts`);
        }

        // Import gyms
        if (gyms && gyms.length > 0) {
          for (const gym of gyms) {
            await db.runAsync(
              // location_type must be restored: places are listed and matched by
              // type, so a NULL here makes the restored gym invisible to the app.
              // Older backups predate the column, so default to 'gym'.
              'INSERT INTO gyms (user_id, location_type, name, latitude, longitude, radius, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [userId, gym.location_type ?? 'gym', gym.name ?? null, gym.latitude, gym.longitude, gym.radius, gym.created_at]
            );
          }
          console.log(`Imported ${gyms.length} gyms`);
        }

        // Import schedules
        if (schedules && schedules.length > 0) {
          for (const schedule of schedules) {
            await db.runAsync(
              'INSERT INTO schedules (user_id, workout_days, workout_time, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
              [userId, schedule.workout_days, schedule.workout_time, schedule.created_at, schedule.updated_at]
            );
          }
          console.log(`Imported ${schedules.length} schedules`);
        }

        // Excuses and freeze tokens point at each other, so excuses go in
        // first without their token, then tokens, then the excuse side is
        // filled in from the token map.
        if (excuseSubmissions && excuseSubmissions.length > 0) {
          for (const excuse of excuseSubmissions) {
            const res = await db.runAsync(
              'INSERT INTO excuse_submissions (user_id, excuse_text, excuse_type, submitted_for_date, submitted_at, freeze_token_used, freeze_token_id, redemption_triggered, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?, ?)',
              [userId, excuse.excuse_text, excuse.excuse_type, excuse.submitted_for_date, excuse.submitted_at, excuse.freeze_token_used, excuse.redemption_triggered, excuse.created_at]
            );
            if (excuse.id != null) excuseIds.set(excuse.id, res.lastInsertRowId);
          }
          console.log(`Imported ${excuseSubmissions.length} excuse submissions`);
        }

        if (freezeTokens && freezeTokens.length > 0) {
          for (const token of freezeTokens) {
            const res = await db.runAsync(
              'INSERT INTO freeze_tokens (user_id, earned_at, earned_on_streak_day, expires_at, used_at, excuse_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [userId, token.earned_at, token.earned_on_streak_day, token.expires_at, token.used_at, remap(excuseIds, token.excuse_id), token.created_at]
            );
            if (token.id != null) tokenIds.set(token.id, res.lastInsertRowId);
          }
          console.log(`Imported ${freezeTokens.length} freeze tokens`);
        }

        for (const excuse of excuseSubmissions ?? []) {
          const newExcuse = remap(excuseIds, excuse.id);
          const newToken = remap(tokenIds, excuse.freeze_token_id);
          if (newExcuse != null && newToken != null) {
            await db.runAsync('UPDATE excuse_submissions SET freeze_token_id = ? WHERE id = ?', [newToken, newExcuse]);
          }
        }

        // Import redemption workouts. The type and target date decide whether
        // the next scheduled session counts, so an active redemption must keep them.
        if (redemptionWorkouts && redemptionWorkouts.length > 0) {
          for (const redemption of redemptionWorkouts) {
            await db.runAsync(
              'INSERT INTO redemption_workouts (user_id, triggered_by_excuse_id, triggered_by_missed_date, triggered_at, starts_at, deadline, completed_at, completed_workout_id, status, redemption_type, target_workout_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
              [userId, remap(excuseIds, redemption.triggered_by_excuse_id), redemption.triggered_by_missed_date, redemption.triggered_at, redemption.starts_at, redemption.deadline, redemption.completed_at, remap(workoutIds, redemption.completed_workout_id), redemption.status, redemption.redemption_type ?? 'unscheduled', redemption.target_workout_date ?? null, redemption.created_at]
            );
          }
          console.log(`Imported ${redemptionWorkouts.length} redemption workouts`);
        }

        // Import daily journal (v3.0+). This is user-typed and cannot be
        // recovered from Health Connect, so it is the most important thing here.
        if (dailyJournal && dailyJournal.length > 0) {
          for (const entry of dailyJournal) {
            await db.runAsync(
              `INSERT INTO daily_journal
                 (user_id, local_date, food_notes, last_meal_time, alcohol_units,
                  caffeine_servings, stress_level, notes, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, local_date) DO NOTHING`,
              [
                userId,
                entry.local_date,
                entry.food_notes ?? null,
                entry.last_meal_time ?? null,
                entry.alcohol_units ?? null,
                entry.caffeine_servings ?? null,
                entry.stress_level ?? null,
                entry.notes ?? null,
                entry.created_at,
                entry.updated_at,
              ]
            );
          }
          console.log(`Imported ${dailyJournal.length} journal entries`);
        }

        // Import journey completions (v3.0+) so earned milestones survive.
        if (journeyCompletions && journeyCompletions.length > 0) {
          for (const j of journeyCompletions) {
            await db.runAsync(
              `INSERT INTO journey_completions
                 (user_id, journey_id, journey_km, total_km_at_completion, completed_at, celebrated, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, journey_id) DO NOTHING`,
              [
                userId,
                j.journey_id,
                j.journey_km,
                j.total_km_at_completion,
                j.completed_at,
                // Already-earned journeys must not re-trigger a celebration.
                1,
                j.created_at,
              ]
            );
          }
          console.log(`Imported ${journeyCompletions.length} journey completions`);
        }

        // Health history (v4.0+). Health Connect only serves 30 days, so on a
        // new phone this backup is the only source for anything older.
        if (healthDailyMetrics && healthDailyMetrics.length > 0) {
          for (const m of healthDailyMetrics) {
            await db.runAsync(
              `INSERT INTO health_daily_metrics
                 (user_id, local_date, hrv_ms, resting_hr, sleep_duration_min,
                  sleep_need_min, sleep_performance, recovery_score, recovery_band,
                  recovery_estimated, steps, distance_km, active_calories,
                  total_calories, weight_kg, zone_minutes, cardio_load,
                  computed_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(user_id, local_date) DO NOTHING`,
              [
                userId, m.local_date, m.hrv_ms ?? null, m.resting_hr ?? null,
                m.sleep_duration_min ?? null, m.sleep_need_min ?? null,
                m.sleep_performance ?? null, m.recovery_score ?? null,
                m.recovery_band ?? null, m.recovery_estimated ?? 0,
                m.steps ?? null, m.distance_km ?? null, m.active_calories ?? null,
                m.total_calories ?? null, m.weight_kg ?? null,
                m.zone_minutes ?? null, m.cardio_load ?? null,
                m.computed_at, m.created_at,
              ]
            );
          }
          console.log(`Imported ${healthDailyMetrics.length} health days`);
        }

        if (healthRecords && healthRecords.length > 0) {
          for (const r of healthRecords) {
            await db.runAsync(
              `INSERT INTO health_records
                 (user_id, hc_record_id, metric_type, value, unit, start_time,
                  end_time, local_date, data_origin, hc_last_modified, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(hc_record_id, metric_type) DO NOTHING`,
              [
                userId, r.hc_record_id, r.metric_type, r.value, r.unit,
                r.start_time, r.end_time, r.local_date, r.data_origin ?? '',
                r.hc_last_modified ?? '', r.created_at,
              ]
            );
          }
          console.log(`Imported ${healthRecords.length} health records`);
        }

        // Sessions first, then stages remapped onto their new row ids: the
        // exported session_id refers to the OLD database's autoincrement value,
        // which will not match after reinsert.
        if (healthSleepSessions && healthSleepSessions.length > 0) {
          const sessionIdMap = new Map<number, number>();
          for (const sess of healthSleepSessions) {
            const res = await db.runAsync(
              `INSERT INTO health_sleep_sessions
                 (user_id, hc_record_id, start_time, end_time, local_date,
                  total_duration_min, awake_min, light_min, deep_min, rem_min,
                  unknown_min, sleep_efficiency, data_origin, hc_last_modified, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId, sess.hc_record_id, sess.start_time, sess.end_time,
                sess.local_date, sess.total_duration_min ?? 0, sess.awake_min ?? 0,
                sess.light_min ?? 0, sess.deep_min ?? 0, sess.rem_min ?? 0,
                sess.unknown_min ?? 0, sess.sleep_efficiency ?? 0,
                sess.data_origin ?? '', sess.hc_last_modified ?? '', sess.created_at,
              ]
            );
            sessionIdMap.set(sess.id, res.lastInsertRowId);
          }

          if (healthSleepStages && healthSleepStages.length > 0) {
            let stageCount = 0;
            for (const st of healthSleepStages) {
              const newId = sessionIdMap.get(st.session_id);
              if (newId === undefined) continue; // orphaned stage
              await db.runAsync(
                `INSERT INTO health_sleep_stages
                   (session_id, stage, start_time, end_time, duration_min)
                 VALUES (?, ?, ?, ?, ?)`,
                [newId, st.stage, st.start_time, st.end_time, st.duration_min ?? 0]
              );
              stageCount++;
            }
            console.log(`Imported ${stageCount} sleep stages`);
          }
          console.log(`Imported ${healthSleepSessions.length} sleep sessions`);
        }

        if (scheduleChangeLogs && scheduleChangeLogs.length > 0) {
          for (const log of scheduleChangeLogs) {
            await db.runAsync(
              'INSERT INTO schedule_change_logs (user_id, changed_at, created_at) VALUES (?, ?, ?)',
              [userId, log.changed_at, log.created_at]
            );
          }
          console.log(`Imported ${scheduleChangeLogs.length} schedule change logs`);
        }

        if (excuseMessageCycles && excuseMessageCycles.length > 0) {
          for (const c of excuseMessageCycles) {
            await db.runAsync(
              `INSERT INTO excuse_message_cycles
                 (user_id, message_category, last_message_index, updated_at, created_at)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(user_id, message_category) DO NOTHING`,
              [userId, c.message_category, c.last_message_index ?? 0, c.updated_at, c.created_at]
            );
          }
          console.log(`Imported ${excuseMessageCycles.length} message cycles`);
        }

        if (healthExerciseSessions && healthExerciseSessions.length > 0) {
          for (const w of healthExerciseSessions) {
            await db.runAsync(
              // Every column the export writes. This used to restore only nine
              // of them, silently dropping max HR, calories, distance and the
              // heart-rate trace — data the backup file did contain, so a
              // restore lost detail that was sitting right there in the file.
              `INSERT INTO health_exercise_sessions
                 (user_id, hc_record_id, exercise_type, exercise_name, title,
                  start_time, end_time, local_date, duration_min, zone_minutes,
                  avg_heart_rate, max_heart_rate, calories, distance_km, steps,
                  hr_samples, data_origin, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(hc_record_id) DO NOTHING`,
              [
                userId, w.hc_record_id, w.exercise_type ?? 0,
                w.exercise_name ?? 'Workout', w.title ?? null,
                w.start_time, w.end_time, w.local_date, w.duration_min ?? 0,
                w.zone_minutes ?? null, w.avg_heart_rate ?? null,
                w.max_heart_rate ?? null, w.calories ?? null,
                w.distance_km ?? null, w.steps ?? null, w.hr_samples ?? null,
                w.data_origin ?? '', w.created_at,
              ]
            );
          }
          console.log(`Imported ${healthExerciseSessions.length} exercise sessions`);
        }

        // Trophies (v6+): unlock dates are kept, so history survives a restore.
        if (achievements && achievements.length > 0) {
          for (const a of achievements) {
            await db.runAsync(
              'INSERT OR IGNORE INTO achievements (user_id, achievement_id, unlocked_at, seen) VALUES (?, ?, ?, ?)',
              [userId, a.achievement_id, a.unlocked_at, a.seen ?? 1]
            );
          }
          console.log(`Imported ${achievements.length} trophies`);
        }

        // Experiments (v6+). Row ids change on insert, so check-ins are
        // re-pointed at the new ids through a map.
        if (experiments && experiments.length > 0) {
          const newId = new Map<number, number>();
          for (const e of experiments) {
            const res = await db.runAsync(
              `INSERT INTO experiments
                 (user_id, template_id, title, rule, off_rule, hypothesis, primary_metric,
                  secondary_metrics, schedule, start_date, status, result, ended_at, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                userId, e.template_id, e.title, e.rule, e.off_rule, e.hypothesis, e.primary_metric,
                e.secondary_metrics ?? '[]', e.schedule, e.start_date, e.status, e.result ?? null,
                e.ended_at ?? null, e.created_at,
              ]
            );
            newId.set(e.id, res.lastInsertRowId);
          }
          for (const c of experimentCheckins ?? []) {
            const id = newId.get(c.experiment_id);
            if (id == null) continue;
            await db.runAsync(
              'INSERT OR IGNORE INTO experiment_checkins (experiment_id, local_date, complied, created_at) VALUES (?, ?, ?, ?)',
              [id, c.local_date, c.complied, c.created_at]
            );
          }
          console.log(`Imported ${experiments.length} experiments`);
        }

        // Update user metadata (name, join date, schedule_changes, highest_streak).
        // The join date gates the weekly recap, trophies and the backup reminder.
        if (user) {
          if (user.display_name) {
            await db.runAsync('UPDATE users SET display_name = ? WHERE id = ?', [user.display_name, userId]);
          }
          if (user.created_at) {
            await db.runAsync('UPDATE users SET created_at = ? WHERE id = ?', [user.created_at, userId]);
          }
          if (user.schedule_changes !== undefined) {
            await db.runAsync(
              'UPDATE users SET schedule_changes = ? WHERE id = ?',
              [user.schedule_changes || 0, userId]
            );
          }
          if (user.highest_streak !== undefined) {
            await db.runAsync(
              'UPDATE users SET highest_streak = ? WHERE id = ?',
              [user.highest_streak || 0, userId]
            );
          }
          // Health profile (v3.0+). Absent in older backups, so only write
          // fields that are actually present rather than nulling them out.
          const profileFields: [string, unknown][] = [
            ['age', user.age],
            ['biological_sex', user.biological_sex],
            ['sleep_goal_min', user.sleep_goal_min],
            ['max_hr_measured', user.max_hr_measured],
            ['steps_goal', user.steps_goal],
          ];
          for (const [column, value] of profileFields) {
            if (value !== undefined) {
              await db.runAsync(
                `UPDATE users SET ${column} = ? WHERE id = ?`,
                [value as string | number | null, userId]
              );
            }
          }
          console.log('Updated user metadata and health profile');
        }

        // Commit transaction
        await db.execAsync('COMMIT');
        console.log('Import transaction committed successfully');

        // Baselines and scores are derived, so they are not in the backup —
        // rebuild them from the restored history. Without this the Health tab
        // shows no recovery score until the next sync happens to run.
        // Deliberately outside the transaction: it opens its own.
        try {
          const { HealthScoreService } = await import('./HealthScoreService');
          await HealthScoreService.recomputeAll();
        } catch (scoreError) {
          console.log('Post-import score recompute skipped:', scoreError);
        }

        // Reminders live in the OS, not the database, so a restore onto a new
        // phone has none. Re-arm them for upcoming sessions and any active
        // redemption. (Experiment check-ins re-arm when the Lab opens.)
        try {
          const today = getTodayLocal();
          for (const s of scheduledWorkouts ?? []) {
            if (s.workout_date >= today) {
              await NotificationService.scheduleOneTimeWorkoutNotifications(s.workout_date, s.workout_time);
            }
          }
          const active = (redemptionWorkouts ?? []).find(
            (r: any) => r.status === 'active' && new Date(r.deadline) > new Date()
          );
          if (active) await NotificationService.scheduleRedemptionReminders(active.deadline);
        } catch (notifyError) {
          console.log('Post-import reminders skipped:', notifyError);
        }

        Alert.alert('✅ SUCCESS', 'Data imported successfully! Your backup has been fully restored.');
      } catch (importError) {
        // Rollback on any error
        await db.execAsync('ROLLBACK');
        console.error('Import failed, transaction rolled back:', importError);
        throw importError;
      }

    } catch (error: any) {
      console.error('Import execution error:', error);
      Alert.alert('Import Failed', error.message || 'Failed to import data into database');
      throw error;
    }
  }
}
