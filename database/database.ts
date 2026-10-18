import * as SQLite from 'expo-sqlite';

export type BiologicalSex = 'male' | 'female' | 'unspecified';

export interface User {
  id: number;
  display_name: string;
  schedule_changes: number;
  highest_streak: number;
  /** Used for the Tanaka max-HR estimate and age-based sleep guidance. */
  age?: number;
  /**
   * Banister's TRIMP uses different lactate-response coefficients for males and
   * females. 'unspecified' falls back to the male curve and the UI says so.
   */
  biological_sex?: BiologicalSex;
  /** Personal sleep target in minutes. Overrides the age-based default. */
  sleep_goal_min?: number;
  /** Daily step target. Defaults to 8000 when unset. */
  steps_goal?: number;
  /** Measured max HR (from a lab or field test) — always beats an estimate. */
  max_hr_measured?: number;
  created_at: string;
}

/** Where a session happens. Gym and home are workouts; sport is counted apart. */
export type PlaceType = 'gym' | 'home' | 'sport';

/** A saved place. The table is still called `gyms` from when it held only one. */
export interface Gym {
  id: number;
  user_id: number;
  location_type: PlaceType;
  /** The user's label, e.g. "PureGym" or "Football pitch". Older rows have none. */
  name?: string | null;
  latitude: number;
  longitude: number;
  radius: number;
  created_at: string;
}

export interface Workout {
  id: number;
  user_id: number;
  verified: boolean;
  workout_date: string;
  duration?: number; // duration in seconds
  status: 'not_started' | 'in_progress' | 'completed';
  started_at?: string;
  ended_at?: string;
  /** Set from the place it was started at. Rows from before places had types are null (a workout). */
  activity?: PlaceType | null;
  place_name?: string | null;
  created_at: string;
}

export interface Skip {
  id: number;
  user_id: number;
  excuse: string;
  skip_date: string;
  /** HH:MM of the workout that was skipped; NULL for older rows or unscheduled days. */
  scheduled_time?: string | null;
  created_at: string;
}

export interface ExperimentRow {
  id: number;
  user_id: number;
  template_id: string;
  title: string;
  rule: string;
  off_rule: string;
  hypothesis: string;
  primary_metric: string;
  /** JSON array of metric ids. */
  secondary_metrics: string;
  /** JSON array of 'A' (rule off) / 'B' (rule on), one per 7-day block. */
  schedule: string;
  start_date: string;
  status: 'active' | 'completed' | 'abandoned';
  /** JSON ExperimentResult, written once on completion. */
  result: string | null;
  ended_at: string | null;
  created_at: string;
}

export interface ExperimentCheckin {
  id: number;
  experiment_id: number;
  local_date: string;
  complied: number;
  created_at: string;
}

export interface AchievementUnlock {
  id: number;
  user_id: number;
  achievement_id: string;
  unlocked_at: string;
  seen: number;
}

export interface Schedule {
  id: number;
  user_id: number;
  workout_days: string; // JSON array
  workout_time: string;
  created_at: string;
  updated_at: string;
}

export interface ScheduledWorkout {
  id: number;
  user_id: number;
  workout_date: string;
  workout_time: string;
  created_at: string;
  updated_at: string;
}

export interface FreezeToken {
  id: number;
  user_id: number;
  earned_at: string;
  earned_on_streak_day: number;
  expires_at: string;
  used_at?: string;
  excuse_id?: number;
  created_at: string;
}

export interface ExcuseSubmission {
  id: number;
  user_id: number;
  excuse_text: string;
  excuse_type: 'medical' | 'emergency' | 'other';
  submitted_for_date: string;
  submitted_at: string;
  freeze_token_used: boolean;
  freeze_token_id?: number;
  redemption_triggered: boolean;
  created_at: string;
}

export interface RedemptionWorkout {
  id: number;
  user_id: number;
  triggered_by_excuse_id?: number;
  triggered_by_missed_date: string;
  triggered_at: string;
  starts_at: string;
  deadline: string;
  completed_at?: string;
  completed_workout_id?: number;
  status: 'active' | 'completed' | 'failed';
  redemption_type: 'next_scheduled' | 'unscheduled';
  target_workout_date?: string;
  created_at: string;
}

export interface ExcuseMessageCycle {
  id: number;
  user_id: number;
  message_category: string;
  last_message_index: number;
  updated_at: string;
  created_at: string;
}

export interface ScheduleChangeLog {
  id: number;
  user_id: number;
  changed_at: string;
  created_at: string;
}

export type HealthMetricType =
  | 'hrv'
  | 'resting_hr'
  | 'heart_rate'
  | 'steps'
  | 'distance'
  | 'active_calories'
  | 'total_calories'
  | 'weight'
  | 'exercise';

/** Raw per-record cache from Health Connect. One row per HC record. */
export interface HealthRecord {
  id: number;
  user_id: number;
  hc_record_id: string; // metadata.id — natural key for dedup
  metric_type: HealthMetricType;
  value: number; // canonical units: ms (hrv), bpm, count, kcal, kg, seconds
  unit: string;
  start_time: string;
  end_time: string;
  local_date: string; // YYYY-MM-DD
  data_origin: string; // source package name
  hc_last_modified: string; // metadata.lastModifiedTime — drives upsert
  created_at: string;
}

/** One row per sleep session, with stage totals denormalised. */
export interface HealthSleepSession {
  id: number;
  user_id: number;
  hc_record_id: string;
  start_time: string;
  end_time: string;
  local_date: string; // date sleep ENDED — the "night of" attribution
  total_duration_min: number; // in-bed span
  awake_min: number;
  light_min: number;
  deep_min: number;
  rem_min: number;
  unknown_min: number;
  sleep_efficiency: number; // asleep / in-bed * 100
  data_origin: string;
  hc_last_modified: string;
  created_at: string;
}

export type SleepStageName =
  | 'awake'
  | 'light'
  | 'deep'
  | 'rem'
  | 'out_of_bed'
  | 'unknown';

/** Individual stages for the hypnogram. Child of health_sleep_sessions. */
export interface HealthSleepStage {
  id: number;
  session_id: number;
  stage: SleepStageName;
  start_time: string;
  end_time: string;
  duration_min: number;
}

/** Computed daily rollup — one row per user per day. Drives all UI. */
export interface HealthDailyMetrics {
  id: number;
  user_id: number;
  local_date: string;
  hrv_ms?: number;
  resting_hr?: number;
  sleep_duration_min?: number;
  sleep_need_min?: number;
  sleep_performance?: number; // 0-100
  recovery_score?: number; // 0-100
  recovery_band?: 'green' | 'yellow' | 'red';
  recovery_estimated?: number; // 1 when computed without HRV
  steps?: number;
  distance_km?: number;
  active_calories?: number;
  total_calories?: number;
  weight_kg?: number;
  zone_minutes?: number;
  cardio_load?: number;
  /** Downsampled all-day heart rate as JSON [[minutesFromMidnight, bpm], ...]. */
  hr_samples?: string;
  computed_at: string;
  created_at: string;
}

/** Rolling baselines, recomputed on sync. One row per user. */
export interface HealthBaseline {
  id: number;
  user_id: number;
  hrv_mean: number;
  hrv_sd: number;
  rhr_mean: number;
  rhr_sd: number;
  sleep_duration_mean: number;
  sample_days: number;
  updated_at: string;
}

/**
 * Optional subjective context for a day.
 *
 * Wearables record what your body did but not what you did to it. These are the
 * behaviours with the best-established effect on overnight recovery — alcohol
 * and late meals both measurably raise nocturnal heart rate and suppress HRV —
 * so logging them is what turns "your recovery is low" into "here is why".
 *
 * Every field is optional; a day with only a food note is still useful.
 */
export interface DailyJournal {
  id: number;
  user_id: number;
  local_date: string;
  /** Free text: what they ate. Deliberately unstructured. */
  food_notes?: string;
  /** Rough time of the last substantial meal, HH:MM. */
  last_meal_time?: string;
  /** Standard drinks; 0 means explicitly none, NULL means not logged. */
  alcohol_units?: number;
  caffeine_servings?: number;
  /** Self-rated 1-5. */
  stress_level?: number;
  /** Free text for anything else — illness, travel, late night. */
  notes?: string;
  created_at: string;
  updated_at: string;
}

/**
 * A journey the user has finished. Persisted rather than derived so the
 * achievement date survives, and so a completed journey stays earned even if
 * the underlying distance total is ever recomputed.
 */
export interface JourneyCompletion {
  id: number;
  user_id: number;
  journey_id: string;
  journey_km: number;
  /** Lifetime distance at the moment it was reached. */
  total_km_at_completion: number;
  completed_at: string;
  /** 0 until the celebration screen has shown it. */
  celebrated: number;
  created_at: string;
}

/**
 * A workout recorded by the user's watch or phone.
 *
 * Previously these were read only to compute zone minutes and then discarded,
 * so the app knew a session happened but could not show what it was.
 */
export interface HealthExerciseSession {
  id: number;
  user_id: number;
  hc_record_id: string;
  /** Health Connect's numeric exercise type. */
  exercise_type: number;
  /** Human-readable name derived from exercise_type, e.g. "Running". */
  exercise_name: string;
  title?: string;
  start_time: string;
  end_time: string;
  local_date: string;
  duration_min: number;
  zone_minutes?: number;
  avg_heart_rate?: number;
  max_heart_rate?: number;
  calories?: number;
  distance_km?: number;
  /** Steps taken during the session — the headline number for a walk. */
  steps?: number;
  /** JSON [[secondsFromStart, bpm], ...] — the trace for the zone chart. */
  hr_samples?: string;
  data_origin: string;
  created_at: string;
}

export interface HealthSyncState {
  id: number;
  user_id: number;
  last_synced_at?: string;
  last_successful_sync_at?: string;
  permission_request_count: number;
  preferred_origin?: string;
  created_at: string;
}

class Database {
  private db: SQLite.SQLiteDatabase | null = null;
  /**
   * In-flight initialisation.
   *
   * Without this, concurrent callers all see `db === null` — it is only assigned
   * after openDatabaseAsync resolves — so each starts its own open plus a full
   * createTables(). Running every CREATE/ALTER simultaneously on the same file
   * deadlocks SQLite and hangs the UI. Callers now await one shared promise.
   */
  private initPromise: Promise<SQLite.SQLiteDatabase> | null = null;

  async initialize(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) return this.db;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      const db = await SQLite.openDatabaseAsync('gym_accountability.db');
      this.db = db;
      await this.createTables();
      return db;
    })();

    try {
      return await this.initPromise;
    } catch (error) {
      // Allow a retry rather than caching a rejected promise forever.
      this.db = null;
      this.initPromise = null;
      throw error;
    }
  }

  private async createTables() {
    if (!this.db) throw new Error('Database not initialized');

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        display_name TEXT NOT NULL,
        schedule_changes INTEGER DEFAULT 0,
        highest_streak INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Handle migration for existing workout table
    await this.migrateWorkoutTable();
    await this.migrateScheduleTable();
    await this.migrateUserTable();
    await this.migrateGymTable();

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS gyms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        location_type TEXT NOT NULL DEFAULT 'gym',
        name TEXT DEFAULT NULL,
        latitude REAL NOT NULL,
        longitude REAL NOT NULL,
        radius REAL DEFAULT 150,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        verified BOOLEAN DEFAULT TRUE,
        workout_date TEXT NOT NULL,
        duration INTEGER DEFAULT NULL,
        status TEXT DEFAULT 'completed',
        started_at TEXT DEFAULT NULL,
        ended_at TEXT DEFAULT NULL,
        activity TEXT DEFAULT NULL,
        place_name TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS skips (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        excuse TEXT NOT NULL,
        skip_date TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS schedules (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        workout_days TEXT NOT NULL,
        workout_time TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS scheduled_workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        workout_date TEXT NOT NULL,
        workout_time TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, workout_date)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS freeze_tokens (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        earned_at TEXT NOT NULL,
        earned_on_streak_day INTEGER NOT NULL,
        expires_at TEXT NOT NULL,
        used_at TEXT DEFAULT NULL,
        excuse_id INTEGER DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (excuse_id) REFERENCES excuse_submissions (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS excuse_submissions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        excuse_text TEXT NOT NULL,
        excuse_type TEXT NOT NULL CHECK (excuse_type IN ('medical', 'emergency', 'other')),
        submitted_for_date TEXT NOT NULL,
        submitted_at TEXT NOT NULL,
        freeze_token_used BOOLEAN DEFAULT FALSE,
        freeze_token_id INTEGER DEFAULT NULL,
        redemption_triggered BOOLEAN DEFAULT FALSE,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (freeze_token_id) REFERENCES freeze_tokens (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS redemption_workouts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        triggered_by_excuse_id INTEGER DEFAULT NULL,
        triggered_by_missed_date TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        starts_at TEXT NOT NULL,
        deadline TEXT NOT NULL,
        completed_at TEXT DEFAULT NULL,
        completed_workout_id INTEGER DEFAULT NULL,
        status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'failed')),
        redemption_type TEXT DEFAULT 'unscheduled' CHECK (redemption_type IN ('next_scheduled', 'unscheduled')),
        target_workout_date TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        FOREIGN KEY (triggered_by_excuse_id) REFERENCES excuse_submissions (id),
        FOREIGN KEY (completed_workout_id) REFERENCES workouts (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS excuse_message_cycles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        message_category TEXT NOT NULL,
        last_message_index INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, message_category)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS schedule_change_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        changed_at TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    // Health Connect cache + computed scores
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        hc_record_id TEXT NOT NULL,
        metric_type TEXT NOT NULL,
        value REAL NOT NULL,
        unit TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        local_date TEXT NOT NULL,
        data_origin TEXT DEFAULT '',
        hc_last_modified TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(hc_record_id, metric_type)
      );
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_health_records_lookup
        ON health_records (user_id, metric_type, local_date);
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_sleep_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        hc_record_id TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        local_date TEXT NOT NULL,
        total_duration_min REAL DEFAULT 0,
        awake_min REAL DEFAULT 0,
        light_min REAL DEFAULT 0,
        deep_min REAL DEFAULT 0,
        rem_min REAL DEFAULT 0,
        unknown_min REAL DEFAULT 0,
        sleep_efficiency REAL DEFAULT 0,
        data_origin TEXT DEFAULT '',
        hc_last_modified TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(hc_record_id)
      );
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_health_sleep_date
        ON health_sleep_sessions (user_id, local_date);
    `);

    // NOTE: no ON DELETE CASCADE — expo-sqlite does not enable PRAGMA foreign_keys
    // and this codebase never sets it. Stage rows are deleted explicitly in
    // HealthConnectService when a session is replaced.
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_sleep_stages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL,
        stage TEXT NOT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        duration_min REAL DEFAULT 0,
        FOREIGN KEY (session_id) REFERENCES health_sleep_sessions (id)
      );
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_health_stages_session
        ON health_sleep_stages (session_id);
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_daily_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        local_date TEXT NOT NULL,
        hrv_ms REAL DEFAULT NULL,
        resting_hr REAL DEFAULT NULL,
        sleep_duration_min REAL DEFAULT NULL,
        sleep_need_min REAL DEFAULT NULL,
        sleep_performance REAL DEFAULT NULL,
        recovery_score REAL DEFAULT NULL,
        recovery_band TEXT DEFAULT NULL,
        recovery_estimated INTEGER DEFAULT 0,
        steps INTEGER DEFAULT NULL,
        distance_km REAL DEFAULT NULL,
        active_calories REAL DEFAULT NULL,
        total_calories REAL DEFAULT NULL,
        weight_kg REAL DEFAULT NULL,
        zone_minutes REAL DEFAULT NULL,
        cardio_load REAL DEFAULT NULL,
        hr_samples TEXT DEFAULT NULL,
        computed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, local_date)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_baselines (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        hrv_mean REAL DEFAULT 0,
        hrv_sd REAL DEFAULT 0,
        rhr_mean REAL DEFAULT 0,
        rhr_sd REAL DEFAULT 0,
        sleep_duration_mean REAL DEFAULT 0,
        sample_days INTEGER DEFAULT 0,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS daily_journal (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        local_date TEXT NOT NULL,
        food_notes TEXT DEFAULT NULL,
        last_meal_time TEXT DEFAULT NULL,
        alcohol_units REAL DEFAULT NULL,
        caffeine_servings REAL DEFAULT NULL,
        stress_level INTEGER DEFAULT NULL,
        notes TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, local_date)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS journey_completions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        journey_id TEXT NOT NULL,
        journey_km REAL NOT NULL,
        total_km_at_completion REAL NOT NULL,
        completed_at TEXT DEFAULT CURRENT_TIMESTAMP,
        celebrated INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, journey_id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_exercise_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        hc_record_id TEXT NOT NULL,
        exercise_type INTEGER DEFAULT 0,
        exercise_name TEXT DEFAULT 'Workout',
        title TEXT DEFAULT NULL,
        start_time TEXT NOT NULL,
        end_time TEXT NOT NULL,
        local_date TEXT NOT NULL,
        duration_min REAL DEFAULT 0,
        zone_minutes REAL DEFAULT NULL,
        avg_heart_rate REAL DEFAULT NULL,
        max_heart_rate REAL DEFAULT NULL,
        calories REAL DEFAULT NULL,
        distance_km REAL DEFAULT NULL,
        steps INTEGER DEFAULT NULL,
        -- Downsampled heart-rate trace as JSON [[secondsFromStart, bpm], ...].
        -- Stored on the session rather than as rows: it is only ever read as a
        -- whole for one chart, and a table would mean thousands of rows per
        -- workout for no gain.
        hr_samples TEXT DEFAULT NULL,
        data_origin TEXT DEFAULT '',
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(hc_record_id)
      );
    `);

    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_health_exercise_date
        ON health_exercise_sessions (user_id, local_date);
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS health_sync_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        last_synced_at TEXT DEFAULT NULL,
        last_successful_sync_at TEXT DEFAULT NULL,
        permission_request_count INTEGER DEFAULT 0,
        preferred_origin TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id)
      );
    `);

    // Unlocked trophies. Definitions live in constants/achievements.ts; only the
    // unlock is stored, so an achievement is never revoked once earned.
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS achievements (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        achievement_id TEXT NOT NULL,
        unlocked_at TEXT NOT NULL,
        seen INTEGER DEFAULT 0,
        FOREIGN KEY (user_id) REFERENCES users (id),
        UNIQUE(user_id, achievement_id)
      );
    `);

    // Self-experiments: a pre-registered rule, metrics and a randomised ABAB
    // schedule. The schedule and metrics are fixed at start and never edited,
    // so the result can't be tuned after the fact.
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS experiments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        template_id TEXT NOT NULL,
        title TEXT NOT NULL,
        rule TEXT NOT NULL,
        off_rule TEXT NOT NULL,
        hypothesis TEXT NOT NULL,
        primary_metric TEXT NOT NULL,
        secondary_metrics TEXT NOT NULL DEFAULT '[]',
        schedule TEXT NOT NULL,
        start_date TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
        result TEXT DEFAULT NULL,
        ended_at TEXT DEFAULT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users (id)
      );
    `);

    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS experiment_checkins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        experiment_id INTEGER NOT NULL,
        local_date TEXT NOT NULL,
        complied INTEGER NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (experiment_id) REFERENCES experiments (id),
        UNIQUE(experiment_id, local_date)
      );
    `);

    // Add migration for existing redemption_workouts table
    await this.migrateRedemptionTable();
    await this.migrateHealthTables();
    await this.migrateSkipTable();
  }

  private async migrateSkipTable() {
    if (!this.db) throw new Error('Database not initialized');

    // Skipping deletes the scheduled workout, which used to lose the planned
    // time. The Lab needs it for time-of-day patterns, so it is kept on the skip.
    await this.db.execAsync(`
      ALTER TABLE skips ADD COLUMN scheduled_time TEXT DEFAULT NULL;
    `).catch(() => {}); // Ignore if column already exists
  }

  private async migrateWorkoutTable() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Add columns if they don't exist
      await this.db.execAsync(`
        ALTER TABLE workouts ADD COLUMN duration INTEGER DEFAULT NULL;
      `).catch(() => {}); // Ignore if column already exists
      
      await this.db.execAsync(`
        ALTER TABLE workouts ADD COLUMN status TEXT DEFAULT 'completed';
      `).catch(() => {});
      
      await this.db.execAsync(`
        ALTER TABLE workouts ADD COLUMN started_at TEXT DEFAULT NULL;
      `).catch(() => {});
      
      await this.db.execAsync(`
        ALTER TABLE workouts ADD COLUMN ended_at TEXT DEFAULT NULL;
      `).catch(() => {});

      await this.db.execAsync(`
        ALTER TABLE workouts ADD COLUMN activity TEXT DEFAULT NULL;
      `).catch(() => {});

      await this.db.execAsync(`
        ALTER TABLE workouts ADD COLUMN place_name TEXT DEFAULT NULL;
      `).catch(() => {});

    } catch (error) {
      console.log('Workout migration handled or not needed:', error);
    }
  }

  private async migrateScheduleTable() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Remove locked column if it exists (migration to remove obsolete field)
      // SQLite doesn't support DROP COLUMN, so we need to recreate the tables
      // For now, just leave the column if it exists - it will be ignored
      // New installs won't have the column at all
      console.log('Schedule migration: locked column will be ignored if present');

    } catch (error) {
      console.log('Schedule migration handled or not needed:', error);
    }
  }

  private async migrateRedemptionTable() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Add starts_at column if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE redemption_workouts ADD COLUMN starts_at TEXT DEFAULT NULL;
      `).catch(() => {}); // Ignore if column already exists

      // For existing records without starts_at, set it to triggered_at for backward compatibility
      await this.db.execAsync(`
        UPDATE redemption_workouts SET starts_at = triggered_at WHERE starts_at IS NULL;
      `).catch(() => {});

      // Add redemption_type column if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE redemption_workouts ADD COLUMN redemption_type TEXT DEFAULT 'unscheduled';
      `).catch(() => {}); // Ignore if column already exists

      // Add target_workout_date column if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE redemption_workouts ADD COLUMN target_workout_date TEXT DEFAULT NULL;
      `).catch(() => {}); // Ignore if column already exists

    } catch (error) {
      console.log('Redemption table migration handled or not needed:', error);
    }
  }

  private async migrateUserTable() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Add schedule_changes column if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN schedule_changes INTEGER DEFAULT 0;
      `).catch(() => {}); // Ignore if column already exists

      // Add highest_streak column if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN highest_streak INTEGER DEFAULT 0;
      `).catch(() => {}); // Ignore if column already exists

      // Add age column if it doesn't exist (used for HR zone estimation)
      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN age INTEGER DEFAULT NULL;
      `).catch(() => {}); // Ignore if column already exists

      // Health profile fields — all optional, each improves a specific formula.
      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN biological_sex TEXT DEFAULT NULL;
      `).catch(() => {});

      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN sleep_goal_min INTEGER DEFAULT NULL;
      `).catch(() => {});

      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN max_hr_measured INTEGER DEFAULT NULL;
      `).catch(() => {});

      await this.db.execAsync(`
        ALTER TABLE users ADD COLUMN steps_goal INTEGER DEFAULT NULL;
      `).catch(() => {});

    } catch (error) {
      console.log('User table migration handled or not needed:', error);
    }
  }

  private async migrateHealthTables() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Added after the initial health schema shipped; safe to re-run.
      await this.db.execAsync(`
        ALTER TABLE health_daily_metrics ADD COLUMN recovery_estimated INTEGER DEFAULT 0;
      `).catch(() => {}); // Ignore if column already exists

      // hrv_mean changed meaning: it was raw RMSSD in ms, and is now ln(RMSSD).
      // A stale ms value would be read as a log and produce badly wrong scores,
      // so clear any baseline that predates the change. It rebuilds on next sync.
      // ln(RMSSD) for plausible human HRV (5-500ms) is ~1.6-6.2, so anything
      // above 10 is certainly an old millisecond value.
      await this.db.execAsync(`
        DELETE FROM health_baselines WHERE hrv_mean > 10;
      `).catch(() => {});

      // All-day heart rate trace for the daily chart.
      await this.db.execAsync(
        `ALTER TABLE health_daily_metrics ADD COLUMN hr_samples TEXT DEFAULT NULL;`
      ).catch(() => {});

      // Workout detail columns, added with the workout zone chart.
      // `steps` came later, so a walk could show the number that actually
      // describes it rather than only distance.
      for (const col of [
        'max_heart_rate REAL',
        'calories REAL',
        'distance_km REAL',
        'hr_samples TEXT',
        'steps INTEGER',
      ]) {
        await this.db.execAsync(
          `ALTER TABLE health_exercise_sessions ADD COLUMN ${col} DEFAULT NULL;`
        ).catch(() => {});
      }

      // Distance was added with the Journeys feature.
      await this.db.execAsync(`
        ALTER TABLE health_daily_metrics ADD COLUMN distance_km REAL DEFAULT NULL;
      `).catch(() => {}); // Ignore if column already exists

    } catch (error) {
      console.log('Health table migration handled or not needed:', error);
    }
  }

  private async migrateGymTable() {
    if (!this.db) throw new Error('Database not initialized');

    try {
      // Add location_type column if it doesn't exist
      await this.db.execAsync(`
        ALTER TABLE gyms ADD COLUMN location_type TEXT DEFAULT 'gym';
      `).catch(() => {}); // Ignore if column already exists

      await this.db.execAsync(`
        ALTER TABLE gyms ADD COLUMN name TEXT DEFAULT NULL;
      `).catch(() => {});

    } catch (error) {
      console.log('Gym table migration handled or not needed:', error);
    }
  }

  async getDatabase(): Promise<SQLite.SQLiteDatabase> {
    if (this.db) return this.db;
    return this.initialize();
  }

  /** Tail of the write queue. Each transaction chains onto the previous one. */
  private writeQueue: Promise<unknown> = Promise.resolve();

  /**
   * Run a write transaction, serialised against every other one.
   *
   * expo-sqlite uses a single connection, so two overlapping
   * `withTransactionAsync` calls deadlock: SQLite blocks the second while the
   * first is still awaiting JS inside its own transaction, and neither can
   * proceed. Independent code paths (sync, score recompute, manual logging) all
   * open transactions, so they are queued here rather than trusted not to
   * overlap.
   */
  async runInTransaction<T>(
    work: (db: SQLite.SQLiteDatabase) => Promise<T>,
    label = 'tx'
  ): Promise<T> {
    const run = this.writeQueue.then(async () => {
      const db = await this.getDatabase();
      let result!: T;
      const started = Date.now();
      console.log(`[db] ${label} start`);

      // A transaction that never settles would block every later write, so it is
      // bounded. Timing out loses that batch but keeps the app usable, and the
      // log identifies which one stalled.
      const timeout = new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error(`[db] ${label} timed out after 20s`)),
          20000
        )
      );

      try {
        await Promise.race([
          db.withTransactionAsync(async () => {
            result = await work(db);
          }),
          timeout,
        ]);
        console.log(`[db] ${label} done in ${Date.now() - started}ms`);
        return result;
      } catch (error) {
        console.log(`[db] ${label} FAILED after ${Date.now() - started}ms`, error);
        throw error;
      }
    });

    // Keep the chain alive even if this transaction throws.
    this.writeQueue = run.catch(() => undefined);
    return run;
  }
}

export const database = new Database();