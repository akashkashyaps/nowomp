import { database, type BiologicalSex, type User } from '@/database/database';
import { UserService } from './UserService';

/**
 * The user-supplied inputs the health formulas depend on, plus the evidence-based
 * defaults used when an input is missing.
 *
 * Every default here is a documented fallback, not a silent guess: `isEstimated`
 * flags let the UI mark a figure as an estimate and prompt for the real value.
 */

/**
 * Tanaka et al. (2001), J Am Coll Cardiol — meta-analysis of 351 studies,
 * 18,712 subjects. Standard error ~10 bpm, roughly half that of "220 - age",
 * which systematically underestimates max HR in adults over 40.
 * https://pubmed.ncbi.nlm.nih.gov/11153730/
 */
export const tanakaMaxHr = (age: number) => Math.round(208 - 0.7 * age);

/** Fallback when age is unknown: Tanaka at ~35, the median adult user. */
export const DEFAULT_MAX_HR = tanakaMaxHr(35); // 183

/**
 * National Sleep Foundation duration recommendations (Hirshkowitz et al., 2015;
 * reaffirmed 2017). Midpoint of the recommended range per age band.
 * https://www.sleephealthjournal.org/article/S2352-7218(15)00015-7/fulltext
 */
export const nsfSleepNeedMinutes = (age?: number | null): number => {
  if (age == null) return 8 * 60; // adult midpoint of the 7-9h range
  if (age <= 13) return 10 * 60; // school age 9-11h
  if (age <= 17) return 9 * 60; // teen 8-10h
  if (age <= 64) return 8 * 60; // adult 7-9h
  return 7.5 * 60; // 65+ 7-8h
};

/**
 * Suggested step targets, offered as choices — never applied silently.
 *
 * The familiar 10,000 comes from a 1960s Japanese pedometer marketing campaign,
 * not research. Meta-analyses of step count against all-cause mortality find the
 * benefit curve flattens around 8,000-10,000 steps for adults under 60 and
 * 6,000-8,000 for those over 60, which is what these suggestions reflect.
 */
export const STEP_GOAL_SUGGESTIONS = [
  { value: 6000, label: '6,000', note: 'where benefit plateaus over 60' },
  { value: 8000, label: '8,000', note: 'where benefit plateaus under 60' },
  { value: 10000, label: '10,000', note: 'the popular target' },
  { value: 12000, label: '12,000', note: 'highly active' },
] as const;

export interface HealthProfile {
  age: number | null;
  biologicalSex: BiologicalSex;
  /** Max heart rate in bpm, and whether it came from a measurement or estimate. */
  maxHr: number;
  maxHrIsEstimated: boolean;
  /** Baseline nightly sleep target in minutes, before debt/strain adjustments. */
  sleepGoalMin: number;
  sleepGoalIsEstimated: boolean;
  /** Daily step target. Null until the user sets one — never assumed. */
  stepsGoal: number | null;
  /** True when TRIMP is falling back to the male lactate curve. */
  sexIsUnspecified: boolean;
  /** Inputs we could ask the user for to improve accuracy. */
  missing: {
    age: boolean;
    biologicalSex: boolean;
    sleepGoal: boolean;
    stepsGoal: boolean;
    maxHr: boolean;
  };
}

export class HealthProfileService {
  static async getProfile(): Promise<HealthProfile> {
    let user: User | null = null;
    try {
      user = await UserService.getCurrentUser();
    } catch {
      user = null;
    }

    const age = user?.age ?? null;
    const biologicalSex: BiologicalSex = user?.biological_sex ?? 'unspecified';

    // Measured beats Tanaka; Tanaka beats the age-less default.
    const measured = user?.max_hr_measured ?? null;
    const maxHr = measured ?? (age != null ? tanakaMaxHr(age) : DEFAULT_MAX_HR);

    const sleepGoal = user?.sleep_goal_min ?? null;
    const stepsGoal = user?.steps_goal ?? null;

    return {
      age,
      biologicalSex,
      maxHr,
      maxHrIsEstimated: measured == null,
      sleepGoalMin: sleepGoal ?? nsfSleepNeedMinutes(age),
      sleepGoalIsEstimated: sleepGoal == null,
      stepsGoal,
      sexIsUnspecified: biologicalSex === 'unspecified',
      missing: {
        age: age == null,
        biologicalSex: biologicalSex === 'unspecified',
        sleepGoal: sleepGoal == null,
        stepsGoal: stepsGoal == null,
        maxHr: measured == null,
      },
    };
  }

  static async updateProfile(fields: {
    age?: number | null;
    biologicalSex?: BiologicalSex | null;
    sleepGoalMin?: number | null;
    stepsGoal?: number | null;
    maxHrMeasured?: number | null;
  }): Promise<void> {
    const db = await database.getDatabase();
    const user = await UserService.getCurrentUser();
    if (!user) throw new Error('No user found');

    const sets: string[] = [];
    const params: (string | number | null)[] = [];

    if ('age' in fields) {
      sets.push('age = ?');
      params.push(fields.age ?? null);
    }
    if ('biologicalSex' in fields) {
      sets.push('biological_sex = ?');
      params.push(fields.biologicalSex ?? null);
    }
    if ('sleepGoalMin' in fields) {
      sets.push('sleep_goal_min = ?');
      params.push(fields.sleepGoalMin ?? null);
    }
    if ('stepsGoal' in fields) {
      sets.push('steps_goal = ?');
      params.push(fields.stepsGoal ?? null);
    }
    if ('maxHrMeasured' in fields) {
      sets.push('max_hr_measured = ?');
      params.push(fields.maxHrMeasured ?? null);
    }

    if (sets.length === 0) return;
    params.push(user.id);

    await db.runAsync(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
  }

  /**
   * Banister's TRIMP weighting factor (Banister 1991).
   *
   * Males:   0.64 * e^(1.92 * HRR)
   * Females: 0.86 * e^(1.67 * HRR)
   *
   * The differing exponents reflect the classically described male/female blood
   * lactate response curves. Without a stated sex we use the male curve, and the
   * UI labels the result as an estimate.
   */
  static trimpWeight(hrrFraction: number, sex: BiologicalSex): number {
    const hrr = Math.min(1, Math.max(0, hrrFraction));
    return sex === 'female'
      ? 0.86 * Math.exp(1.67 * hrr)
      : 0.64 * Math.exp(1.92 * hrr);
  }
}
