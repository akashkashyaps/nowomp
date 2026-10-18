/**
 * Trophy definitions.
 *
 * Each achievement reads one number from AchievementStats and unlocks when it
 * reaches `target`. That single shape gives every locked trophy a progress bar
 * for free. Only the unlock is stored (the `achievements` table), so ids must
 * never change once shipped.
 */

export type AchievementGroup =
  | 'consistency'
  | 'accountability'
  | 'lab'
  | 'health'
  | 'journeys'
  | 'shame';

export interface AchievementStats {
  totalWorkouts: number;
  bestStreak: number;
  perfectWeeks: number;
  earlyWorkouts: number;
  lateWorkouts: number;
  longestSessionMin: number;
  cleanDays: number;
  comebacks: number;
  redemptionsCompleted: number;
  freezeTokensEarned: number;
  weakDayWins: number;
  tiredButWent: number;
  backedExcuses: number;
  disputedExcuses: number;
  sleepGoalRun: number;
  stepsGoalRun: number;
  greenRun: number;
  journeysCompleted: number;
  distinctExcuses: number;
  excuseCounts: Record<string, number>;
  maxSkipsIn7Days: number;
  maxEmergenciesIn30Days: number;
  longestSameExcuseRun: number;
  experimentsCompleted: number;
  experimentsAbandoned: number;
  experimentsWorked: number;
}

export interface AchievementDefinition {
  id: string;
  title: string;
  description: string;
  emoji: string;
  group: AchievementGroup;
  /** Hidden trophies show as "???" until earned. */
  hidden?: boolean;
  target: number;
  value: (s: AchievementStats) => number;
}

export const GROUP_LABELS: Record<AchievementGroup, string> = {
  consistency: 'CONSISTENCY',
  accountability: 'ACCOUNTABILITY',
  lab: 'LAB',
  health: 'HEALTH',
  journeys: 'JOURNEYS',
  shame: 'HALL OF SHAME',
};

export const ACHIEVEMENTS: AchievementDefinition[] = [
  // Consistency
  { id: 'first_rep', title: 'First Rep', emoji: '🏋️', group: 'consistency', target: 1,
    description: 'Complete your first verified workout', value: (s) => s.totalWorkouts },
  { id: 'regular', title: 'Regular', emoji: '💪', group: 'consistency', target: 10,
    description: 'Complete 10 verified workouts', value: (s) => s.totalWorkouts },
  { id: 'gym_rat', title: 'Gym Rat', emoji: '🐀', group: 'consistency', target: 50,
    description: 'Complete 50 verified workouts', value: (s) => s.totalWorkouts },
  { id: 'centurion', title: 'Centurion', emoji: '💯', group: 'consistency', target: 100,
    description: 'Complete 100 verified workouts', value: (s) => s.totalWorkouts },
  { id: 'on_fire', title: 'On Fire', emoji: '🔥', group: 'consistency', target: 7,
    description: 'Reach a 7-workout streak', value: (s) => s.bestStreak },
  { id: 'unbreakable', title: 'Unbreakable', emoji: '⛓️', group: 'consistency', target: 30,
    description: 'Reach a 30-workout streak', value: (s) => s.bestStreak },
  { id: 'legend', title: 'Legend', emoji: '👑', group: 'consistency', target: 100,
    description: 'Reach a 100-workout streak', value: (s) => s.bestStreak },
  { id: 'perfect_week', title: 'Perfect Week', emoji: '📅', group: 'consistency', target: 1,
    description: '4+ workouts in one week (Mon–Sun) with zero excuses', value: (s) => s.perfectWeeks },
  { id: 'early_bird', title: 'Early Bird', emoji: '🌅', group: 'consistency', target: 5,
    description: 'Start 5 workouts before 8am', value: (s) => s.earlyWorkouts },
  { id: 'night_owl', title: 'Night Owl', emoji: '🦉', group: 'consistency', target: 5,
    description: 'Start 5 workouts after 8pm', value: (s) => s.lateWorkouts },
  { id: 'long_haul', title: 'Long Haul', emoji: '⏱️', group: 'consistency', target: 90,
    description: 'Finish a 90-minute session', value: (s) => s.longestSessionMin },

  // Accountability
  { id: 'clean_month', title: 'Clean Month', emoji: '🧼', group: 'accountability', target: 30,
    description: '30 days without an excuse (and 8+ workouts in that time)', value: (s) => s.cleanDays },
  { id: 'comeback_kid', title: 'Comeback Kid', emoji: '🔄', group: 'accountability', target: 1,
    description: 'Work out the day after making an excuse', value: (s) => s.comebacks },
  { id: 'redeemed', title: 'Redeemed', emoji: '🙏', group: 'accountability', target: 1,
    description: 'Complete a redemption workout', value: (s) => s.redemptionsCompleted },
  { id: 'redemption_arc', title: 'Redemption Arc', emoji: '🦸', group: 'accountability', target: 5,
    description: 'Complete 5 redemption workouts', value: (s) => s.redemptionsCompleted },
  { id: 'ice_cold', title: 'Ice Cold', emoji: '🧊', group: 'accountability', target: 1,
    description: 'Earn a freeze token', value: (s) => s.freezeTokensEarned },

  // Lab — built from what the Lab finds out about you
  { id: 'weak_spot_slayer', title: 'Weak Spot Slayer', emoji: '🗡️', group: 'lab', target: 4,
    description: 'Work out 4 times on your most-skipped weekday since you last skipped it',
    value: (s) => s.weakDayWins },
  { id: 'tired_but_went', title: 'Tired But Went', emoji: '🧟', group: 'lab', target: 1,
    description: 'Work out on a day with red recovery or under 6h sleep', value: (s) => s.tiredButWent },
  { id: 'scientist', title: 'Scientist', emoji: '🧪', group: 'lab', target: 1,
    description: 'Finish a 4-week experiment', value: (s) => s.experimentsCompleted },
  { id: 'peer_reviewed', title: 'Peer Reviewed', emoji: '🔬', group: 'lab', target: 3,
    description: 'Finish 3 experiments', value: (s) => s.experimentsCompleted },
  { id: 'eureka', title: 'Eureka', emoji: '💡', group: 'lab', target: 1,
    description: 'Run an experiment that clearly worked', value: (s) => s.experimentsWorked },
  { id: 'receipts', title: 'Receipts', emoji: '🧾', group: 'lab', target: 5,
    description: 'Have 5 excuses backed up by your own data', value: (s) => s.backedExcuses },

  // Health
  { id: 'well_rested', title: 'Well Rested', emoji: '🛌', group: 'health', target: 7,
    description: 'Hit your sleep goal 7 nights in a row', value: (s) => s.sleepGoalRun },
  { id: 'step_machine', title: 'Step Machine', emoji: '👟', group: 'health', target: 7,
    description: 'Hit your steps goal 7 days in a row', value: (s) => s.stepsGoalRun },
  { id: 'in_the_green', title: 'In The Green', emoji: '🟢', group: 'health', target: 5,
    description: 'Green recovery 5 days in a row', value: (s) => s.greenRun },

  // Journeys
  { id: 'wanderer', title: 'Wanderer', emoji: '🗺️', group: 'journeys', target: 1,
    description: 'Complete your first journey', value: (s) => s.journeysCompleted },
  { id: 'explorer', title: 'Explorer', emoji: '🧭', group: 'journeys', target: 3,
    description: 'Complete 3 journeys', value: (s) => s.journeysCompleted },

  // Hall of shame — hidden until you earn them
  { id: 'excuse_collector', title: 'Excuse Collector', emoji: '🗃️', group: 'shame', hidden: true, target: 8,
    description: 'Used 8 different excuses. Impressive range.', value: (s) => s.distinctExcuses },
  { id: 'weatherman', title: 'Weatherman', emoji: '⛈️', group: 'shame', hidden: true, target: 5,
    description: 'Blamed the weather 5 times. The gym has a roof.',
    value: (s) => s.excuseCounts['Bad Weather'] ?? 0 },
  { id: 'forever_alone', title: 'Forever Alone', emoji: '🐺', group: 'shame', hidden: true, target: 5,
    description: 'Skipped 5 times for lack of a gym buddy.',
    value: (s) => s.excuseCounts['Not Having a Gym Buddy'] ?? 0 },
  { id: 'serial_skipper', title: 'Serial Skipper', emoji: '🛋️', group: 'shame', hidden: true, target: 3,
    description: '3 excuses within 7 days.', value: (s) => s.maxSkipsIn7Days },
  { id: 'caught_red_handed', title: 'Caught Red-Handed', emoji: '🚨', group: 'shame', hidden: true, target: 3,
    description: '3 excuses your own body disagreed with.', value: (s) => s.disputedExcuses },
  { id: 'main_character', title: 'Main Character', emoji: '🎭', group: 'shame', hidden: true, target: 3,
    description: '3 "genuine emergencies" in 30 days. Eventful life.',
    value: (s) => s.maxEmergenciesIn30Days },
  { id: 'lab_rat_escaped', title: 'Lab Rat Escaped', emoji: '🐀', group: 'shame', hidden: true, target: 1,
    description: 'Abandoned an experiment halfway. Science weeps.', value: (s) => s.experimentsAbandoned },
  { id: 'broken_record', title: 'Broken Record', emoji: '📼', group: 'shame', hidden: true, target: 3,
    description: 'The same excuse 3 times in a row.', value: (s) => s.longestSameExcuseRun },
];
