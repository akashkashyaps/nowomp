/**
 * The excuse list — the single source of truth for the excuse screens, the
 * motivational messages and the Lab.
 *
 * Skips are stored by their label text, so labels must never be renamed: an old
 * row with a renamed label would fall through to the 'other' fallback below and
 * drop out of the analysis. Add new entries instead.
 */

/**
 * Why the skip happened, inferred from the excuse itself so the user is never
 * asked a follow-up question.
 * - external: something outside your control stopped you
 * - internal: you could have gone but didn't want to
 * - physical: a body state the health data can check
 */
export type ExcuseCategory = 'external' | 'internal' | 'physical';

/**
 * Which health signal can confirm or contradict the excuse. Excuses about
 * mental state or circumstances are deliberately never "disputed" — the data
 * cannot see them, and calling anxiety or an emergency a lie would be wrong.
 */
export type FactCheckKind = 'sleep' | 'soreness' | 'activity' | 'stress' | 'illness' | 'none';

export interface ExcuseDefinition {
  label: string;
  short: string;
  emoji: string;
  category: ExcuseCategory;
  check: FactCheckKind;
}

export const EXCUSES: readonly ExcuseDefinition[] = [
  { label: 'Feeling Unmotivated / Tired', short: 'Tired', emoji: '😴', category: 'internal', check: 'sleep' },
  { label: 'Too Busy / Ran Out of Time', short: 'Too busy', emoji: '⏳', category: 'internal', check: 'activity' },
  { label: 'Feeling Anxious', short: 'Anxious', emoji: '😰', category: 'internal', check: 'stress' },
  { label: 'Discouraged by Lack of Progress', short: 'Discouraged', emoji: '📉', category: 'internal', check: 'none' },
  { label: 'Too Sore / Need Recovery', short: 'Sore', emoji: '🦵', category: 'physical', check: 'soreness' },
  { label: 'Sick / Injured', short: 'Sick', emoji: '🤒', category: 'physical', check: 'illness' },
  { label: 'Work Commitments', short: 'Work', emoji: '💼', category: 'external', check: 'none' },
  { label: 'Family / Social Plans', short: 'Family/social', emoji: '👨‍👩‍👧', category: 'external', check: 'none' },
  { label: 'Travelling', short: 'Travel', emoji: '✈️', category: 'external', check: 'none' },
  { label: 'Bad Weather', short: 'Weather', emoji: '🌧️', category: 'external', check: 'none' },
  { label: 'Not Having a Gym Buddy', short: 'No buddy', emoji: '🫥', category: 'internal', check: 'none' },
  { label: 'Genuine Emergency', short: 'Emergency', emoji: '🚨', category: 'external', check: 'none' },
] as const;

export const EXCUSE_LABELS: string[] = EXCUSES.map((e) => e.label);

const FALLBACK: ExcuseDefinition = {
  label: 'Other',
  short: 'Other',
  emoji: '❔',
  category: 'external',
  check: 'none',
};

export const getExcuse = (label: string): ExcuseDefinition =>
  EXCUSES.find((e) => e.label === label) ?? { ...FALLBACK, label, short: label };

export const CATEGORY_LABELS: Record<ExcuseCategory, string> = {
  external: "Couldn't go",
  internal: "Didn't want to",
  physical: 'Body said no',
};
