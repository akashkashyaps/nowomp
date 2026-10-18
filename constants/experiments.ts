/**
 * Self-experiment library.
 *
 * Every experiment is a 4-week ABAB design: four 7-day blocks alternating
 * "rule on" (B) and "rule off" (A), with the starting phase randomised. The
 * catalog is fixed and curated; the user's data only decides which templates
 * are suggested first (see `trigger`) and which are unavailable (`primary`
 * metric has no data). Template and metric ids are stored on experiment rows,
 * so they must never change once shipped.
 */

export const BLOCK_DAYS = 7;
export const BLOCK_COUNT = 4;
export const EXPERIMENT_DAYS = BLOCK_DAYS * BLOCK_COUNT;
/** Below this share of compliant days the primary result is not trusted. */
export const MIN_COMPLIANCE = 0.7;

export type MetricId =
  | 'sleep_duration'
  | 'deep_sleep'
  | 'sleep_efficiency'
  | 'sleep_performance'
  | 'hrv'
  | 'resting_hr'
  | 'recovery'
  | 'steps'
  | 'attendance'
  | 'stress';

export interface MetricDefinition {
  id: MetricId;
  label: string;
  unit: string;
  better: 'higher' | 'lower';
  /**
   * Days between the behaviour and the measurement. Sleep and morning heart
   * data are stored against the morning they were recorded, so a rule followed
   * on Monday shows up in Tuesday's row.
   */
  lag: number;
  /**
   * Days ignored at the start of every block while the body adjusts to the
   * switch. Without it, carry-over from the previous phase blurs the contrast.
   */
  washout: number;
  /** Minimum valid days per phase before a verdict is given. */
  minPerPhase: number;
}

export const METRICS: Record<MetricId, MetricDefinition> = {
  sleep_duration: { id: 'sleep_duration', label: 'Sleep duration', unit: 'min', better: 'higher', lag: 1, washout: 0, minPerPhase: 8 },
  deep_sleep: { id: 'deep_sleep', label: 'Deep sleep', unit: 'min', better: 'higher', lag: 1, washout: 0, minPerPhase: 8 },
  sleep_efficiency: { id: 'sleep_efficiency', label: 'Sleep efficiency', unit: '%', better: 'higher', lag: 1, washout: 0, minPerPhase: 8 },
  sleep_performance: { id: 'sleep_performance', label: 'Sleep performance', unit: '%', better: 'higher', lag: 1, washout: 0, minPerPhase: 8 },
  hrv: { id: 'hrv', label: 'HRV', unit: 'ms', better: 'higher', lag: 1, washout: 2, minPerPhase: 6 },
  resting_hr: { id: 'resting_hr', label: 'Resting heart rate', unit: 'bpm', better: 'lower', lag: 1, washout: 2, minPerPhase: 6 },
  recovery: { id: 'recovery', label: 'Recovery', unit: '%', better: 'higher', lag: 1, washout: 1, minPerPhase: 7 },
  steps: { id: 'steps', label: 'Steps', unit: 'steps', better: 'higher', lag: 0, washout: 0, minPerPhase: 8 },
  attendance: { id: 'attendance', label: 'Show-up rate', unit: '%', better: 'higher', lag: 0, washout: 0, minPerPhase: 3 },
  stress: { id: 'stress', label: 'Stress (journal)', unit: '/5', better: 'lower', lag: 0, washout: 0, minPerPhase: 5 },
};

export const METRIC_ORDER: MetricId[] = [
  'sleep_duration',
  'deep_sleep',
  'sleep_efficiency',
  'sleep_performance',
  'hrv',
  'resting_hr',
  'recovery',
  'steps',
  'attendance',
  'stress',
];

/**
 * Pre-computed facts about the user that templates use to decide whether to
 * suggest themselves. Filled by ExperimentService; nulls mean "no data".
 */
export interface ExperimentSignals {
  avgCaffeine: number | null;
  alcoholDays: number;
  /** % lower HRV the morning after 2+ drinks vs. other mornings. */
  hrvDropAfterDrinking: number | null;
  bedtimeSpreadMin: number | null;
  wakeSpreadMin: number | null;
  lateMealDays: number;
  avgSleepEfficiency: number | null;
  avgSleepPerformance: number | null;
  avgSteps: number | null;
  weakDay: { day: number; rate: number } | null;
  busySkips: number;
  internalShare: number | null;
  buddySkips: number;
  overallSkipRate: number | null;
}

export type ExperimentCategory = 'sleep' | 'training' | 'activity';

export interface Suggestion {
  /** 0-1, higher is more relevant. */
  score: number;
  reason: string;
}

export interface ExperimentTemplate {
  id: string;
  title: string;
  emoji: string;
  category: ExperimentCategory;
  /** What to do on "rule on" weeks. */
  rule: string;
  /** What to do on "rule off" weeks. */
  offRule: string;
  hypothesis: string;
  primary: MetricId;
  secondary: MetricId[];
  /** Note shown before starting, e.g. what to log. */
  note?: string;
  trigger: (s: ExperimentSignals) => Suggestion | null;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const fmtMin = (m: number) => `${Math.round(m)} min`;

export const CATEGORY_TITLES: Record<ExperimentCategory, string> = {
  sleep: 'SLEEP & RECOVERY',
  training: 'TRAINING & SHOWING UP',
  activity: 'ACTIVITY',
};

export const EXPERIMENT_TEMPLATES: ExperimentTemplate[] = [
  // Sleep & recovery
  {
    id: 'no_late_caffeine',
    title: 'No caffeine after 2pm',
    emoji: '☕',
    category: 'sleep',
    rule: 'No coffee, energy drinks, tea or cola after 2pm.',
    offRule: 'Have caffeine whenever you normally would.',
    hypothesis: 'Cutting afternoon caffeine increases deep sleep.',
    primary: 'deep_sleep',
    secondary: ['sleep_duration', 'sleep_efficiency', 'hrv'],
    trigger: (s) =>
      s.avgCaffeine != null && s.avgCaffeine >= 2
        ? { score: clamp01(0.4 + s.avgCaffeine / 8), reason: `You log about ${s.avgCaffeine.toFixed(1)} caffeine servings a day` }
        : s.avgSleepEfficiency != null && s.avgSleepEfficiency < 85
          ? { score: 0.35, reason: `Your sleep efficiency averages ${Math.round(s.avgSleepEfficiency)}%` }
          : null,
  },
  {
    id: 'alcohol_free',
    title: 'Alcohol-free weeks',
    emoji: '🍺',
    category: 'sleep',
    rule: 'No alcohol at all.',
    offRule: 'Drink as you normally would. Log it in the journal.',
    hypothesis: 'No alcohol raises HRV.',
    primary: 'hrv',
    secondary: ['resting_hr', 'recovery', 'deep_sleep'],
    note: 'Log your drinks in the Health journal, even on rule-off weeks.',
    trigger: (s) =>
      s.hrvDropAfterDrinking != null && s.hrvDropAfterDrinking >= 5
        ? { score: clamp01(0.5 + s.hrvDropAfterDrinking / 40), reason: `Your HRV is ${Math.round(s.hrvDropAfterDrinking)}% lower the morning after drinking` }
        : s.alcoholDays >= 3
          ? { score: 0.4, reason: `You logged drinks on ${s.alcoholDays} days recently` }
          : null,
  },
  {
    id: 'fixed_bedtime',
    title: 'Fixed bedtime',
    emoji: '🛏️',
    category: 'sleep',
    rule: 'In bed at the same time every night (±30 min), weekends included.',
    offRule: 'Go to bed whenever you feel like it.',
    hypothesis: 'A consistent bedtime improves sleep performance.',
    primary: 'sleep_performance',
    secondary: ['sleep_duration', 'recovery'],
    trigger: (s) =>
      s.bedtimeSpreadMin != null && s.bedtimeSpreadMin >= 45
        ? { score: clamp01(s.bedtimeSpreadMin / 120), reason: `Your bedtime varies by about ±${fmtMin(s.bedtimeSpreadMin)}` }
        : null,
  },
  {
    id: 'consistent_wake',
    title: 'Same wake time, every day',
    emoji: '⏰',
    category: 'sleep',
    rule: 'Get up at the same time every day (±30 min), weekends included.',
    offRule: 'Wake up whenever you like.',
    hypothesis: 'A fixed wake time improves recovery.',
    primary: 'recovery',
    secondary: ['sleep_performance', 'resting_hr'],
    trigger: (s) =>
      s.wakeSpreadMin != null && s.wakeSpreadMin >= 45
        ? { score: clamp01(s.wakeSpreadMin / 120), reason: `Your wake time varies by about ±${fmtMin(s.wakeSpreadMin)}` }
        : null,
  },
  {
    id: 'early_dinner',
    title: 'Dinner 3 hours before bed',
    emoji: '🍽️',
    category: 'sleep',
    rule: 'Finish your last meal at least 3 hours before bed.',
    offRule: 'Eat dinner whenever you normally do.',
    hypothesis: 'Eating earlier lowers resting heart rate overnight.',
    primary: 'resting_hr',
    secondary: ['hrv', 'sleep_efficiency'],
    note: 'Log your last meal time in the Health journal.',
    trigger: (s) =>
      s.lateMealDays >= 3
        ? { score: clamp01(0.3 + s.lateMealDays / 15), reason: `You ate after 9pm on ${s.lateMealDays} days recently` }
        : null,
  },
  {
    id: 'no_screens',
    title: 'No screens in bed',
    emoji: '📵',
    category: 'sleep',
    rule: 'No phone, laptop or TV for the last hour before sleep.',
    offRule: 'Use screens before bed as usual.',
    hypothesis: 'Screen-free evenings improve sleep efficiency.',
    primary: 'sleep_efficiency',
    secondary: ['sleep_duration', 'deep_sleep'],
    trigger: (s) =>
      s.avgSleepEfficiency != null && s.avgSleepEfficiency < 88
        ? { score: clamp01((90 - s.avgSleepEfficiency) / 15), reason: `Your sleep efficiency averages ${Math.round(s.avgSleepEfficiency)}%` }
        : null,
  },

  // Training & showing up
  {
    id: 'weak_day_morning',
    title: 'Move your weak day to the morning',
    emoji: '🌅',
    category: 'training',
    rule: 'Schedule your weakest weekday’s workout before 9am.',
    offRule: 'Keep that day at its usual time.',
    hypothesis: 'Morning sessions get skipped less.',
    primary: 'attendance',
    secondary: ['recovery'],
    note: 'Update the time in Plan at the start of each week.',
    trigger: (s) =>
      s.weakDay
        ? { score: clamp01(0.5 + s.weakDay.rate / 2), reason: `You skip ${Math.round(s.weakDay.rate * 100)}% of ${DAY_NAMES[s.weakDay.day]} sessions` }
        : null,
  },
  {
    id: 'twenty_minute_minimum',
    title: '20-minute minimum',
    emoji: '⏱️',
    category: 'training',
    rule: 'Short on time? Go anyway and do just 20 minutes. It still counts.',
    offRule: 'Train as you normally would.',
    hypothesis: 'Lowering the bar cuts "too busy" skips.',
    primary: 'attendance',
    secondary: ['steps'],
    trigger: (s) =>
      s.busySkips >= 2
        ? { score: clamp01(0.4 + s.busySkips / 10), reason: `"Busy" or "work" was your excuse ${s.busySkips} times` }
        : null,
  },
  {
    id: 'kit_ready',
    title: 'Gym bag packed the night before',
    emoji: '🎒',
    category: 'training',
    rule: 'Pack your gym bag and lay out clothes the night before every session.',
    offRule: 'Prepare the way you normally do.',
    hypothesis: 'Removing friction gets you there more often.',
    primary: 'attendance',
    secondary: [],
    trigger: (s) =>
      s.internalShare != null && s.internalShare >= 0.5
        ? { score: clamp01(s.internalShare), reason: `${Math.round(s.internalShare * 100)}% of your excuses are "didn't want to"` }
        : null,
  },
  {
    id: 'training_partner',
    title: 'Train with someone',
    emoji: '🤝',
    category: 'training',
    rule: 'Book a class or arrange a training partner for every session.',
    offRule: 'Train solo as usual.',
    hypothesis: 'Social commitment improves your show-up rate.',
    primary: 'attendance',
    secondary: ['stress'],
    trigger: (s) =>
      s.buddySkips >= 2
        ? { score: clamp01(0.5 + s.buddySkips / 10), reason: `"No gym buddy" was your excuse ${s.buddySkips} times` }
        : null,
  },

  // Activity
  {
    id: 'ten_k_steps',
    title: '10,000 steps a day',
    emoji: '👟',
    category: 'activity',
    rule: 'Hit 10,000 steps every day.',
    offRule: 'Move as much as you normally would.',
    hypothesis: 'More daily movement lengthens sleep.',
    primary: 'sleep_duration',
    secondary: ['resting_hr', 'stress'],
    trigger: (s) =>
      s.avgSteps != null && s.avgSteps < 8000
        ? { score: clamp01((9000 - s.avgSteps) / 6000), reason: `You average ${Math.round(s.avgSteps).toLocaleString()} steps a day` }
        : null,
  },
  {
    id: 'evening_walk',
    title: '10-minute walk after dinner',
    emoji: '🚶',
    category: 'activity',
    rule: 'Walk for at least 10 minutes within an hour of dinner.',
    offRule: 'Do whatever you normally do after dinner.',
    hypothesis: 'An after-dinner walk improves sleep efficiency.',
    primary: 'sleep_efficiency',
    secondary: ['deep_sleep', 'stress'],
    trigger: (s) =>
      s.avgSteps != null && s.avgSteps < 6000
        ? { score: 0.3, reason: `Your evenings look quiet: ${Math.round(s.avgSteps).toLocaleString()} steps a day` }
        : null,
  },
];

export const CUSTOM_TEMPLATE_ID = 'custom';

export const getTemplate = (id: string) => EXPERIMENT_TEMPLATES.find((t) => t.id === id) ?? null;
