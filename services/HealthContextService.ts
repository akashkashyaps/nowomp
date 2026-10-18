import { HealthScoreService } from './HealthScoreService';
import { HealthConnectService } from './HealthConnectService';
import { HealthProfileService } from './HealthProfileService';
import { DailyJournalService } from './DailyJournalService';
import { getTodayLocal } from '@/utils/dateUtils';

/**
 * Builds a self-contained analysis prompt from the user's health data.
 *
 * Two things decide whether the answer is any good, and both are about
 * restraint rather than completeness:
 *
 * 1. The output contract is bounded. An open request like "analyse this"
 *    reliably produces a long recap of the input, because restating data is the
 *    easiest way to fill space. Word budgets and a "do not restate" rule force
 *    the model to spend its output on inference instead.
 *
 * 2. The data section says each thing exactly once. An earlier version repeated
 *    the partial-day caveat five times and the scoring method twice; repetition
 *    in the input is mirrored back in the output, and it buried the numbers
 *    that mattered. Every caveat now lives in one "How to read this" block.
 */

const fmt = (v: number | null | undefined, digits = 0) =>
  v == null || !isFinite(v) ? 'no data' : v.toFixed(digits);

const fmtDuration = (min: number | null | undefined) => {
  if (min == null || !isFinite(min)) return 'no data';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return `${h}h ${m.toString().padStart(2, '0')}m`;
};

const pct = (v: number | null | undefined) =>
  v == null || !isFinite(v) ? 'no data' : `${v > 0 ? '+' : ''}${v.toFixed(0)}%`;

export class HealthContextService {
  /**
   * Assemble the full prompt. Everything is read from the local cache, so this
   * performs no network access.
   */
  static async buildAnalysisPrompt(): Promise<string> {
    const [
      profile,
      today,
      baseline,
      weekly,
      series,
      nights,
      correlations,
      consistency,
      journal,
      workouts,
    ] = await Promise.all([
      HealthProfileService.getProfile(),
      HealthScoreService.getTodayMetrics(),
      HealthScoreService.getBaseline(),
      HealthScoreService.getWeeklyComparison(),
      HealthConnectService.getDailyMetrics(30),
      HealthScoreService.getRecentSleepNights(14),
      HealthScoreService.getCorrelations(),
      HealthScoreService.getSleepConsistency(),
      DailyJournalService.getRecent(30),
      HealthConnectService.getRecentExerciseSessions(20),
    ]);

    const L: string[] = [];

    const now = new Date();
    const generatedTime = now.toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit',
    });
    const weekday = now.toLocaleDateString([], { weekday: 'long' });
    const hoursElapsed = now.getHours() + now.getMinutes() / 60;
    const pctElapsed = Math.round((hoursElapsed / 24) * 100);

    // ------------------------------------------------------ output contract
    //
    // Hard structural caps, not a word budget. A stated word count is followed
    // loosely; "one sentence" and "at most three bullets" are followed closely,
    // because they are checkable while writing. The worked example does the
    // rest: it fixes length, density and tone in a way no instruction does.
    L.push(
      'You are a sports scientist reading one person\'s longitudinal data.',
      '',
      'Reply with ONLY these four sections. No preamble, no closing summary, no extra headings. Under 200 words total.',
      '',
      '**VERDICT** — One sentence: TRAIN HARD, TRAIN EASY, or REST today, and the single reason.',
      '**WHY** — Three sentences maximum. The physiological read, against my baselines.',
      '**PATTERNS** — Up to three bullets, one line each. Multi-day only.',
      '**DO THIS** — One sentence: the action, plus the number that will show in a week whether it worked.',
      '',
      'Rules:',
      '- Do not restate my data. I can see it. Cite a number only when it drives the conclusion.',
      '- Cut any sentence that would be true for a stranger.',
      '- Observational n-of-1 data with uncontrolled confounders. Never assert causation from correlation.',
      '- A behavioural claim needs ~5 occurrences AND ~5 non-occurrences. Below that, say "hypothesis" or "insufficient data" and move on.',
      '- Prefer "not enough data" to a plausible guess.',
      '',
      'Example of the length and density expected — the numbers below are invented, ignore them:',
      '',
      '> **VERDICT** — TRAIN EASY: HRV is 12% below baseline for a third straight day while resting HR climbs.',
      '> **WHY** — A multi-day HRV decline with rising resting HR is accumulating sympathetic load, not one bad night. Sleep duration is on target, so this is not simple sleep debt. Deep sleep falling from 21% to 14% points at training or stress rather than time in bed.',
      '> **PATTERNS**',
      '> - Deep sleep % down in 6 of the last 8 nights.',
      '> - Lower HRV the morning after every 2+ drink entry (4 occurrences — hypothesis).',
      '> - Caffeine timing: insufficient data, 3 logged days.',
      '> **DO THIS** — Cap intensity at Z2 for 48h; HRV back within 5% of your 62ms baseline means recovered.',
      '',
      '---',
      ''
    );

    // -------------------------------------------------- caveats, stated once
    L.push('## How to read this');
    L.push(
      `- Snapshot taken ${weekday} ${getTodayLocal()} at ${generatedTime} local, ${pctElapsed}% through the day.`
    );
    L.push(
      '- **Different time spans.** Sleep, HRV, resting heart rate and recovery describe LAST NIGHT. Steps, distance, calories and training load are partial running totals for today. Today\'s activity cannot have influenced last night\'s HRV; last night can influence today.'
    );
    L.push(
      '- **"no data" and blank cells mean not recorded, not zero.** Training I did not start on a device never reaches the workout list, so an empty day there does not prove I rested.'
    );
    L.push(
      '- Scores are computed against my own rolling baselines. Values marked estimated were derived, not measured.'
    );
    L.push('');

    // ---------------------------------------------------------------- profile
    const profileBits = [
      `age ${profile.age ?? 'not provided'}`,
      profile.biologicalSex,
      `max HR ${profile.maxHr} bpm ${profile.maxHrIsEstimated ? '(estimated)' : '(measured)'}`,
      `sleep target ${fmtDuration(profile.sleepGoalMin)} ${
        profile.sleepGoalIsEstimated ? '(age-band default)' : '(my goal)'
      }`,
    ];
    if (profile.stepsGoal != null) {
      profileBits.push(`step goal ${profile.stepsGoal.toLocaleString()}`);
    }
    L.push(`## Me`);
    L.push(profileBits.join(' · '));
    L.push('');

    // ------------------------------------------------------------------ today
    L.push(`## Today`);
    if (today) {
      L.push('Last night:');
      L.push(
        `- Recovery ${fmt(today.recovery_score)}/100${
          today.recovery_estimated ? ' (estimated — no HRV)' : ''
        } · HRV ${fmt(today.hrv_ms)} ms · resting HR ${fmt(today.resting_hr)} bpm`
      );
      L.push(
        `- Slept ${fmtDuration(today.sleep_duration_min)} of ${fmtDuration(
          today.sleep_need_min
        )} needed (${fmt(today.sleep_performance)}%)`
      );
      L.push(`So far today (${pctElapsed}% elapsed):`);
      L.push(
        `- ${today.steps != null ? today.steps.toLocaleString() : 'no data'} steps · ${fmt(
          today.distance_km,
          2
        )} km · ${fmt(today.total_calories)} kcal total, ${fmt(today.active_calories)} active`
      );
      L.push(
        `- Zone minutes (70%+ max HR) ${fmt(today.zone_minutes)} · cardio load (TRIMP) ${fmt(
          today.cardio_load
        )}`
      );
      L.push(`- Weight ${fmt(today.weight_kg, 1)} kg`);
    } else {
      L.push('- Nothing recorded yet.');
    }
    L.push('');

    // --------------------------------------------------------------- baseline
    L.push(`## My baselines`);
    if (baseline && baseline.sampleDays > 0) {
      L.push(
        `From ${baseline.sampleDays} days${
          baseline.ready ? '' : ' — under 7, so scores are provisional'
        }: HRV ${fmt(baseline.hrvMeanMs, 1)} ms · resting HR ${fmt(
          baseline.rhrMean,
          1
        )} bpm · sleep ${fmtDuration(baseline.sleepDurationMean)}`
      );
    } else {
      L.push('Not enough history yet.');
    }
    L.push('');

    // ------------------------------------------------------------- this week
    L.push(`## Last 7 days vs the 7 before`);
    const w = weekly.thisWeek;
    const d = weekly.delta;
    const row = (label: string, value: string, delta: number | null | undefined) =>
      L.push(`- ${label}: ${value} (${pct(delta)})`);

    row('Recovery', `${fmt(w.recovery_score)}/100`, d.recovery_score);
    row('Sleep', fmtDuration(w.sleep_duration_min), d.sleep_duration_min);
    row('Sleep performance', `${fmt(w.sleep_performance)}%`, d.sleep_performance);
    row('HRV', `${fmt(w.hrv_ms, 1)} ms`, d.hrv_ms);
    row('Resting HR', `${fmt(w.resting_hr, 1)} bpm`, d.resting_hr);
    row('Steps', w.steps != null ? Math.round(w.steps).toLocaleString() : 'no data', d.steps);
    row('Calories', `${fmt(w.total_calories)} kcal`, d.total_calories);
    row('Weight', `${fmt(w.weight_kg, 1)} kg`, d.weight_kg);
    L.push('');

    // ------------------------------------------------------------ sleep detail
    L.push(`## Sleep`);
    if (consistency.score != null) {
      L.push(
        `Consistency ${consistency.score}/100 over ${consistency.nights} nights · typical bed ${consistency.avgBedtime}, wake ${consistency.avgWakeTime}`
      );
    }
    if (nights.length > 0) {
      L.push('');
      L.push('date | deep | REM | light | awake | asleep');
      for (const n of nights) {
        const asleep = n.light_min + n.deep_min + n.rem_min;
        L.push(
          `${n.local_date} | ${fmtDuration(n.deep_min)} | ${fmtDuration(n.rem_min)} | ${fmtDuration(
            n.light_min
          )} | ${fmtDuration(n.awake_min)} | ${fmtDuration(asleep)}`
        );
      }
    } else {
      L.push('No sleep sessions recorded.');
    }
    L.push('');

    // ------------------------------------------------------------ daily series
    const withData = series.filter(
      (s) =>
        s.recovery_score != null ||
        s.hrv_ms != null ||
        s.sleep_duration_min != null ||
        s.steps != null
    );
    if (withData.length > 0) {
      L.push(`## Daily history`);
      L.push(
        'Newest first. Each row pairs the night ENDING that morning with that day\'s activity; the top row is partial.'
      );
      L.push('date | recovery | sleep | HRV ms | RHR bpm | steps | kcal');
      for (const s of withData) {
        L.push(
          [
            s.local_date,
            fmt(s.recovery_score),
            fmtDuration(s.sleep_duration_min),
            fmt(s.hrv_ms, 1),
            fmt(s.resting_hr, 1),
            s.steps != null ? Math.round(s.steps) : 'no data',
            fmt(s.total_calories),
          ].join(' | ')
        );
      }
      L.push('');
    }

    // --------------------------------------------------------------- workouts
    //
    // The daily rollups above carry zone minutes and cardio load, which say
    // that I trained but not what I did. A 45-minute Z4 run and a 45-minute
    // walk can produce similar daily numbers and have entirely different
    // implications for the next morning's HRV, so the sessions go in too.
    if (workouts.length > 0) {
      L.push(`## Recorded workouts`);
      L.push('Newest first. Blank means the device did not record it.');
      L.push('date | type | mins | avg HR | max HR | zone min | kcal | km | steps');
      for (const s of workouts) {
        L.push(
          [
            s.local_date,
            s.title || s.exercise_name,
            Math.round(s.duration_min),
            s.avg_heart_rate != null ? Math.round(s.avg_heart_rate) : '',
            s.max_heart_rate != null ? Math.round(s.max_heart_rate) : '',
            s.zone_minutes != null ? Math.round(s.zone_minutes) : '',
            s.calories != null ? Math.round(s.calories) : '',
            s.distance_km != null ? s.distance_km.toFixed(2) : '',
            s.steps != null ? Math.round(s.steps) : '',
          ].join(' | ')
        );
      }
      L.push('');
    }

    // NOTE: the app's own GPS gym check-ins are deliberately NOT included.
    // They are logged inconsistently, so their gaps would be read as rest days
    // and would mislead more than the data helps. Everything here comes from
    // Health Connect, which records automatically.

    // --------------------------------------------------------------- journal
    const withEntries = journal.filter(
      (j) =>
        j.food_notes ||
        j.alcohol_units != null ||
        j.caffeine_servings != null ||
        j.stress_level != null ||
        j.notes
    );

    if (withEntries.length > 0) {
      L.push(`## Journal`);
      // getRecent(30) caps the ROW count, and rows exist only for logged days —
      // so journal.length is the number logged, never the window. Writing "N of
      // the last {journal.length}" always rendered "N of the last N".
      L.push(
        `${withEntries.length} day${withEntries.length === 1 ? '' : 's'} logged in the last 30. Unlisted days were not logged — absence is not "nothing happened".`
      );
      for (const j of withEntries) {
        const parts: string[] = [];
        if (j.food_notes) parts.push(`ate: ${j.food_notes}`);
        if (j.last_meal_time) parts.push(`last meal ${j.last_meal_time}`);
        if (j.alcohol_units != null) parts.push(`alcohol ${j.alcohol_units}`);
        if (j.caffeine_servings != null) parts.push(`caffeine ${j.caffeine_servings}`);
        if (j.stress_level != null) parts.push(`stress ${j.stress_level}/5`);
        if (j.notes) parts.push(`note: ${j.notes}`);
        L.push(`- ${j.local_date}: ${parts.join(' | ')}`);
      }
      if (withEntries.length < 10) {
        L.push(
          `Only ${withEntries.length} logged days — below the threshold for a behavioural claim.`
        );
      }
      L.push('');
    } else {
      L.push(`## Journal`);
      L.push(
        'Nothing logged. You can say what my body did but not why — flag anywhere a journal entry would have explained an anomaly.'
      );
      L.push('');
    }

    // ----------------------------------------------------------- correlations
    if (correlations.length > 0) {
      L.push(`## Correlations with recovery`);
      L.push(correlations.map((c) => `${c.label} r=${c.r.toFixed(2)}`).join(' · '));
      L.push('');
    }

    // ------------------------------------------------------------- method
    L.push('---');
    L.push('');
    L.push(
      'Method, so you can judge the numbers: recovery = HRV 55% + resting HR 25% + sleep performance 20%, each as deviation from my rolling baseline in Smallest Worthwhile Change units (0.5 × SD). HRV is analysed as ln(RMSSD), since RMSSD is right-skewed. Sleep need follows National Sleep Foundation age bands adjusted for recent debt and training. Max HR uses Tanaka (208 − 0.7 × age). Training load uses Banister TRIMP. Everything but the journal was recorded automatically via Android Health Connect.'
    );

    return L.join('\n');
  }
}
