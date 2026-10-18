import type { TourStep } from '@/components/tour/Tour';

/**
 * Tour scripts. One short line per step — the tour exists because nobody reads
 * a wall of rules. The full rules stay in Settings → How the rules work.
 */

export const HOME_TOUR = 'home';
export const LAB_TOUR = 'lab';
export const YOU_TOUR = 'you';
export const HEALTH_TOUR = 'health';
export const ALL_TOURS = [HOME_TOUR, LAB_TOUR, YOU_TOUR, HEALTH_TOUR];

export const HOME_TOUR_STEPS: TourStep[] = [
  {
    target: 'home.streak',
    title: 'YOUR STREAK 🔥',
    body: 'Every verified workout adds one. Miss a scheduled workout without an excuse and it resets.',
  },
  {
    target: 'home.plan',
    title: 'PLAN YOUR WEEK',
    body: 'Schedule workouts here. Only scheduled days count. Rest days never hurt your streak.',
  },
  {
    target: 'home.start',
    placement: 'top',
    title: 'START AT THE GYM',
    body: "Tap start when you're there. Your location is checked, so it has to be real.",
  },
  {
    target: 'home.excuse',
    placement: 'top',
    title: "CAN'T MAKE IT?",
    body: 'Make an excuse before you skip. Freeze tokens (1 per 15-workout streak) protect your streak.',
  },
  {
    target: 'tab.health',
    title: 'HEALTH',
    body: 'Sleep, recovery and steps from your watch, via Health Connect.',
  },
  {
    target: 'tab.lab',
    title: 'THE LAB 🧪',
    body: 'Fact-checks your excuses against your own data, and runs 4-week experiments on your habits.',
  },
  {
    target: 'tab.you',
    title: 'YOU',
    body: 'Trophies, stats and settings. The full rules live here too: You → How NoWomp works.',
  },
];

export const LAB_TOUR_STEPS: TourStep[] = [
  {
    target: 'lab.experiments',
    title: 'EXPERIMENTS',
    body: 'Test one change for 4 weeks (rule on, off, on, off) and find out if it really works for you.',
  },
  {
    target: 'lab.habits',
    title: 'HABITS',
    body: 'How drinks, caffeine, late dinners and stress show up in your body the next morning, and your best time to train.',
  },
  {
    target: 'lab.factcheck',
    title: 'EXCUSE FACT-CHECK',
    body: 'Tired? Sore? Busy? Your sleep, recovery and steps either back you up or call you out.',
  },
  {
    target: 'lab.patterns',
    title: 'PATTERNS',
    body: 'Your weak days and times, and what happens before you skip. Beat them for trophies.',
  },
];

export const YOU_TOUR_STEPS: TourStep[] = [
  {
    target: 'you.trophies',
    title: 'TROPHIES',
    body: 'Tap to see all 35. Locked ones show what you need to do. The Hall of Shame stays hidden until you earn it.',
  },
  {
    target: 'you.links',
    title: 'SHORTCUTS',
    body: 'Plan your workouts, read your Sunday recap, or look up the full rules any time.',
  },
  {
    target: 'you.stats',
    title: 'YOUR NUMBERS',
    body: 'Streak, verified workouts, skips, your best streak, average session and redemptions, all in one place.',
  },
  {
    target: 'you.journeys',
    title: 'JOURNEYS',
    body: 'Every step you walk, mapped onto famous routes. Finish one to earn a trophy.',
  },
  {
    target: 'you.freeze',
    title: 'FREEZE TOKENS',
    body: 'Tokens you hold, and how close you are to the next one (1 every 15-workout streak).',
  },
  {
    target: 'you.consistency',
    title: 'CONSISTENCY',
    body: 'Days without an excuse, and how often you move your schedule around. Fewer changes is better.',
  },
  {
    target: 'you.settings',
    title: 'SETTINGS',
    body: 'Your name, gym and home locations, health profile, backups, and Replay App Tour.',
  },
];

export const HEALTH_TOUR_STEPS: TourStep[] = [
  {
    target: 'health.recovery',
    title: 'RECOVERY',
    body: 'How ready your body is today, from HRV, resting heart rate and sleep. Needs about 7 days to learn your normal. Pull down to sync.',
  },
  {
    target: 'health.sleep',
    title: 'SLEEP',
    body: 'Last night against your sleep goal, your sleep stages, how regular your bedtime is, and the past week.',
  },
  {
    target: 'health.today',
    title: 'TODAY',
    body: 'Steps against your goal, calories, heart rate through the day, and your weight. Log weight here too.',
  },
  {
    target: 'health.trends',
    title: 'TRENDS',
    body: 'How recovery, sleep, HRV, heart rate, steps and weight are moving. Switch the range to zoom out.',
  },
  {
    target: 'health.workouts',
    title: 'WORKOUTS',
    body: 'Every session your watch recorded, with heart rate zones.',
  },
  {
    target: 'health.journal',
    title: 'DAILY JOURNAL',
    body: 'Stress, caffeine, alcohol and meals. Thirty seconds a day, and it powers the Lab and your experiments.',
  },
  {
    target: 'health.ai',
    title: 'ASK AN AI',
    body: 'Copies a full summary of your data to paste into ChatGPT or Claude. Nothing is sent from the app.',
  },
];
